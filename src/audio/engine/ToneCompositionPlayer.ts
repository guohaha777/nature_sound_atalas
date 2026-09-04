import * as Tone from "tone";
import type {
  CompositionPlayer,
  PlaybackPlan,
  PlaybackState,
} from "../ports/CompositionPlayer";
import { ActiveSoundTracker } from "../scheduler/ActiveSoundTracker";
import { assertPlaybackPlanAssets } from "../scheduler/validatePlaybackPlan";
import { AudioBufferCache } from "../cache/AudioBufferCache";
import { resolveEventPlaybackDuration } from "../scheduler/resolveEventPlaybackDuration";
import { scheduleFilterContour } from "../scheduler/scheduleFilterContour";
import { clampSeekSeconds } from "../playback/clampSeekSeconds";
import {
  backgroundBusGainDb,
  backgroundToneSettings,
  clampMidi,
  childBusGainDb,
  DUCK_ATTACK_SECONDS,
  DUCK_RELEASE_SECONDS,
  duckDepthDb,
  endingFadeSeconds,
  maxSimultaneousSounds,
  polyphonyVelocity,
  voicePan,
  voiceTrimDb,
} from "../mixing";

export class ToneCompositionPlayer implements CompositionPlayer {
  private readonly transport = Tone.getTransport();
  private readonly limiter = new Tone.Limiter(-1).toDestination();
  private readonly masterBus = new Tone.Volume(0).connect(this.limiter);
  private readonly originalBus = new Tone.Volume(childBusGainDb(1)).connect(this.masterBus);
  private readonly polishBus = new Tone.Volume(-Infinity).connect(this.masterBus);
  // 背景链路：声部 → 亮度滤波 → 空间 → 背景总线。
  // 这两个节点的参数由作品的音色底色决定，不是固定预设，详见 deriveBackgroundVoicing。
  // 混响挂成**并行发送**，不放在主通路上：
  // Tone 的混响脉冲是异步生成的，重设 decay 时还会断开卷积器；
  // 一旦放在主通路上，这段时间整层背景就是静音的。
  private readonly polishSpace = new Tone.Reverb({ decay: 1.4, wet: 1 }).connect(this.polishBus);
  private readonly polishSend = new Tone.Gain(0).connect(this.polishSpace);
  private readonly polishTone = new Tone.Filter({ type: "lowpass", frequency: 4200, rolloff: -12 }).connect(this.polishBus);
  // 每个声部先过"电平 + 声像"，再进背景总线：
  // 和弦声部要比单音声部低一些才不会盖住回应；左右稍微散开，孩子的原声始终居中。
  private readonly padTrim = new Tone.PanVol(voicePan("pad"), voiceTrimDb("pad")).connect(this.polishTone);
  private readonly pulseTrim = new Tone.PanVol(voicePan("pulse"), voiceTrimDb("pulse")).connect(this.polishTone);
  private readonly malletTrim = new Tone.PanVol(voicePan("mallet"), voiceTrimDb("mallet")).connect(this.polishTone);
  private readonly pluckTrim = new Tone.PanVol(voicePan("pluck"), voiceTrimDb("pluck")).connect(this.polishTone);
  private readonly bassTrim = new Tone.PanVol(voicePan("bass"), voiceTrimDb("bass")).connect(this.polishTone);
  private readonly pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 1.4, decay: 0.8, sustain: 0.35, release: 2.5 } }).connect(this.padTrim);
  private readonly pulse = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.015, decay: 0.14, sustain: 0.05, release: 0.22 } }).connect(this.pulseTrim);
  private readonly mallet = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.006, decay: 0.42, sustain: 0.04, release: 0.7 } }).connect(this.malletTrim);
  private readonly pluck = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.008, decay: 0.26, sustain: 0.08, release: 0.45 } }).connect(this.pluckTrim);
  private readonly bass = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.025, decay: 0.28, sustain: 0.22, release: 0.55 } }).connect(this.bassTrim);
  private readonly bufferCache = new AudioBufferCache<Tone.ToneAudioBuffer>(
    (url) => Tone.ToneAudioBuffer.fromUrl(url),
    (buffer) => buffer.dispose(),
    8,
  );
  private eventPlayers = new Map<string, Tone.Player>();
  private eventFilters = new Map<string, Tone.Filter>();
  private eventPitchShifters = new Map<string, Tone.PitchShift>();
  private eventPlaybackSeconds = new Map<string, number>();
  private polishPlayer: Tone.Player | null = null;
  private polishPlaybackSeconds = 0;
  private plan: PlaybackPlan | null = null;
  private timer: number | null = null;
  private highlightTimers = new Set<number>();
  private activeSounds = new ActiveSoundTracker();
  private activeEvents = new ActiveSoundTracker();
  private listeners = new Set<(state: PlaybackState) => void>();
  private state: PlaybackState = { status: "idle", currentTime: 0, duration: 0, activeSoundUnitIds: [], activeCompositionEventIds: [], polishEnabled: false, errorMessage: null };

  constructor() {
    // 干声已经直达背景总线，这里再分出一路送进混响。
    this.polishTone.connect(this.polishSend);
  }

  async unlock(): Promise<void> {
    await Tone.start();
  }

  async load(plan: PlaybackPlan): Promise<void> {
    this.stop();
    this.disposeEventPlayers();
    this.plan = plan;
    try {
      assertPlaybackPlanAssets(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "缺少音频资产";
      this.state = { status: "error", currentTime: 0, duration: plan.composition.durationSeconds, activeSoundUnitIds: [], activeCompositionEventIds: [], polishEnabled: plan.composition.polishEnabled, errorMessage: message };
      this.emit();
      throw new Error(message);
    }
    this.transport.bpm.value = plan.composition.bpm;
    this.state = {
      status: "loading",
      currentTime: 0,
      duration: plan.composition.durationSeconds,
      activeSoundUnitIds: [],
      activeCompositionEventIds: [],
      polishEnabled: plan.composition.polishEnabled,
      errorMessage: null,
    };
    this.emit();
    this.originalBus.volume.rampTo(childBusGainDb(this.maxSimultaneousChildSounds()), 0.05);
    this.applyBackgroundVoicing();
    this.polishBus.volume.rampTo(this.state.polishEnabled ? this.polishGainDb() : -Infinity, 0.08);
    try {
      const referencedAssets = new Map(plan.composition.events.map((event) => {
        const asset = plan.assets[event.audioAssetId];
        return [event.audioAssetId, asset] as const;
      }));
      const decodedBuffers = new Map(await Promise.all(Array.from(referencedAssets, async ([audioAssetId, asset]) => {
        if (!asset) throw new Error(`缺少音频资产：${audioAssetId}`);
        return [audioAssetId, await this.bufferCache.get(audioAssetId, asset.url)] as const;
      })));
      plan.composition.events.forEach((event) => {
        const buffer = decodedBuffers.get(event.audioAssetId);
        if (!buffer) return;
        const startSeconds = event.startBeat * (60 / plan.composition.bpm);
        const maximumPlaybackSeconds = Math.max(0.01, plan.composition.durationSeconds - startSeconds);
        const timing = resolveEventPlaybackDuration(event, plan.composition.bpm, buffer.duration, maximumPlaybackSeconds);
        const filter = new Tone.Filter(18000, "lowpass").connect(this.originalBus);
        // 不移调时直接跳过 PitchShift：相位声码器即使 pitch=0 也会给原声染色。
        // 需要移调时用更大的窗口，宁可牺牲一点瞬态，也不要金属味的颤动。
        const pitchShift = event.semitoneShift === 0
          ? null
          : new Tone.PitchShift({ pitch: event.semitoneShift, windowSize: 0.18 }).connect(filter);
        const requestedFadeOut = event.fadeOutSeconds ?? (timing.wasTrimmed ? 0.8 : 0.35);
        const player = new Tone.Player({
          url: buffer,
          fadeIn: event.fadeInSeconds ?? 0.025,
          fadeOut: Math.min(requestedFadeOut, timing.playbackSeconds / 2),
        }).connect(pitchShift ?? filter);
        player.volume.value = event.gainDb;
        player.loop = timing.shouldLoop;
        if (player.loop && event.sourceSelectionDurationSeconds) {
          player.loopStart = event.sourceOffsetSeconds ?? 0;
          player.loopEnd = Math.min(buffer.duration, (event.sourceOffsetSeconds ?? 0) + event.sourceSelectionDurationSeconds);
        }
        this.eventPlayers.set(event.id, player);
        this.eventFilters.set(event.id, filter);
        if (pitchShift) this.eventPitchShifters.set(event.id, pitchShift);
        this.eventPlaybackSeconds.set(event.id, timing.playbackSeconds);
      });
      const polishLayer = plan.composition.polishLayer;
      if (polishLayer?.audioUrl && polishLayer.audioAssetId) {
        const buffer = await this.bufferCache.get(`polish:${polishLayer.audioAssetId}`, polishLayer.audioUrl);
        this.polishPlayer = new Tone.Player({ url: buffer, fadeIn: 0.8, fadeOut: 1.2 }).connect(this.polishBus);
        // 背景比孩子长出一条尾巴（见 backgroundTailSeconds），这里**不能**截到作品时长：
        // 截了就又变成原声戛然而止，作品听上去像没处理完。
        this.polishPlaybackSeconds = buffer.duration;
      }
      const completePlaybackDuration = Math.max(
        plan.composition.durationSeconds,
        // 让整首作品等到背景收完再结束，收尾交给背景而不是原声。
        this.polishPlaybackSeconds,
        ...plan.composition.events.map((event) => event.startBeat * (60 / plan.composition.bpm) + (this.eventPlaybackSeconds.get(event.id) ?? 0)),
      );
      this.state = { ...this.state, duration: completePlaybackDuration };
      this.schedulePlan();
      this.state = { ...this.state, status: "ready" };
      this.emit();
    } catch {
      const message = "音频加载失败，请重新尝试或更换示例声音。";
      this.state = { ...this.state, status: "error", errorMessage: message };
      this.emit();
      throw new Error(message);
    }
  }

  play(): void {
    if (!this.plan) return;
    this.resetMasterBus(this.transport.seconds);
    if (this.state.status === "ended") {
      this.transport.stop();
      this.transport.cancel(0);
      this.transport.seconds = 0;
      this.schedulePlan();
    }
    const resumeAt = this.state.status === "paused" ? this.transport.seconds : null;
    this.state = { ...this.state, status: "playing", errorMessage: null };
    this.transport.start();
    if (resumeAt !== null) this.resumeSourcesAt(resumeAt);
    this.startClock();
    this.emit();
  }

  pause(): void {
    this.transport.pause();
    this.stopClock();
    this.clearHighlightTimers();
    this.eventPlayers.forEach((player) => {
      if (player.state === "started") player.stop();
    });
    if (this.polishPlayer?.state === "started") this.polishPlayer.stop();
    this.pad.releaseAll();
    this.pulse.triggerRelease();
    this.mallet.releaseAll();
    this.pluck.releaseAll();
    this.bass.triggerRelease();
    this.state = { ...this.state, status: "paused", currentTime: this.transport.seconds, activeSoundUnitIds: [], activeCompositionEventIds: [] };
    this.emit();
  }

  seek(seconds: number): void {
    if (!this.plan) return;
    const target = clampSeekSeconds(seconds, this.state.duration);
    const wasPlaying = this.state.status === "playing";
    if (wasPlaying) this.transport.pause();
    this.stopClock();
    this.clearHighlightTimers();
    this.stopActiveSources();
    this.transport.seconds = target;

    if (target >= this.state.duration) {
      this.silenceAtEnd();
      this.state = { ...this.state, status: "ended", currentTime: this.state.duration, activeSoundUnitIds: [], activeCompositionEventIds: [] };
      this.emit();
      return;
    }

    this.resetMasterBus(target);
    this.state = { ...this.state, status: wasPlaying ? "playing" : "paused", currentTime: target, activeSoundUnitIds: [], activeCompositionEventIds: [], errorMessage: null };
    if (wasPlaying) {
      this.transport.start();
      this.resumeSourcesAt(target);
      this.resumeSymbolicBackgroundAt(target);
      this.startClock();
    }
    this.emit();
  }

  stop(): void {
    this.transport.stop();
    this.transport.cancel(0);
    this.transport.seconds = 0;
    this.stopClock();
    this.clearHighlightTimers();
    this.eventPlayers.forEach((player) => {
      if (player.state === "started") player.stop();
    });
    if (this.polishPlayer?.state === "started") this.polishPlayer.stop();
    this.pad.releaseAll();
    this.pulse.triggerRelease();
    this.mallet.releaseAll();
    this.pluck.releaseAll();
    this.bass.triggerRelease();
    this.resetMasterBus();
    this.state = { ...this.state, status: this.plan ? "ready" : "idle", currentTime: 0, activeSoundUnitIds: [], activeCompositionEventIds: [] };
    this.emit();
  }

  setPolishEnabled(enabled: boolean): void {
    this.polishBus.volume.rampTo(enabled ? this.polishGainDb() : -Infinity, 0.15);
    this.state = { ...this.state, polishEnabled: enabled };
    this.emit();
  }

  subscribe(listener: (state: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.stop();
    this.disposeEventPlayers();
    this.pad.dispose();
    this.pulse.dispose();
    this.mallet.dispose();
    this.pluck.dispose();
    this.bass.dispose();
    this.bufferCache.clear();
    this.padTrim.dispose();
    this.pulseTrim.dispose();
    this.malletTrim.dispose();
    this.pluckTrim.dispose();
    this.bassTrim.dispose();
    this.polishTone.dispose();
    this.polishSend.dispose();
    this.polishSpace.dispose();
    this.originalBus.dispose();
    this.polishBus.dispose();
    this.masterBus.dispose();
    this.limiter.dispose();
  }

  private schedulePlan(): void {
    if (!this.plan) return;
    const secondsPerBeat = 60 / this.plan.composition.bpm;
    this.plan.composition.events.forEach((event) => {
      const player = this.eventPlayers.get(event.id);
      const filter = this.eventFilters.get(event.id);
      if (!player) return;
      const startSeconds = event.startBeat * secondsPerBeat;
      const durationSeconds = this.eventPlaybackSeconds.get(event.id) ?? Math.max(0.16, event.durationBeats * secondsPerBeat);
      this.transport.schedule((time) => {
        if (filter) scheduleFilterContour(filter, event.filterMotion ?? "none", time, durationSeconds);
        const sourceOffsetSeconds = event.sourceOffsetSeconds ?? 0;
        if (player.loop) player.start(time, sourceOffsetSeconds, durationSeconds);
        else player.start(time, sourceOffsetSeconds, durationSeconds);
        Tone.getDraw().schedule(() => this.activateEvent(event.id, event.soundUnitId, durationSeconds), time);
      }, startSeconds);
    });
    this.schedulePolishDucking();

    if (this.plan.composition.polishLayer?.audioUrl && this.polishPlayer) {
      this.transport.schedule((time) => this.polishPlayer?.start(time, 0, this.polishPlaybackSeconds), 0);
    } else if (this.plan.composition.polishLayer?.symbolicPlan) {
      this.plan.composition.polishLayer.symbolicPlan.events.forEach((event) => {
        this.transport.schedule((time) => {
          const notes = event.midiNotes.map((midi) => this.shiftedNote(midi));
          const velocity = polyphonyVelocity(event.velocity, notes.length);
          if (event.voice === "pad") this.pad.triggerAttackRelease(notes, event.durationSeconds, time, velocity);
          else if (event.voice === "mallet") this.mallet.triggerAttackRelease(notes, event.durationSeconds, time, velocity);
          else if (event.voice === "pluck") this.pluck.triggerAttackRelease(notes, event.durationSeconds, time, velocity);
          else if (event.voice === "bass") this.bass.triggerAttackRelease(notes[0], event.durationSeconds, time, event.velocity);
          else this.pulse.triggerAttackRelease(notes[0], event.durationSeconds, time, event.velocity);
        }, event.startSeconds);
      });
    } else if (this.plan.composition.polishLayer) {
      const direction = this.plan.composition.polishLayer.direction ?? { energy: 0.35, pulse: 0.2, tension: 0.2, space: 0.7, energyBand: "balanced" as const };
      const padStep = direction.energyBand === "driving" ? 3.6 : direction.energyBand === "balanced" ? 5.4 : 8;
      const padDuration = Math.max(2.8, padStep + direction.space * 1.8);
      const chords = direction.tension > 0.62
        ? [["C3", "G3", "D4"], ["A2", "E3", "B3"], ["F2", "C3", "G3"], ["G2", "D3", "A3"]]
        : [["C3", "G3", "E4"], ["A2", "E3", "C4"], ["F2", "C3", "A3"], ["G2", "D3", "B3"]];
      Array.from({ length: Math.ceil(this.plan.composition.durationSeconds / padStep) }, (_, index) => index * padStep).forEach((start, index) => {
        this.transport.schedule((time) => {
          this.pad.triggerAttackRelease(chords[index % chords.length], padDuration, time, 0.18 + direction.energy * 0.18);
        }, start);
      });
      if (direction.pulse >= 0.32) {
        const beatSeconds = 60 / this.plan.composition.bpm;
        const pulseStep = beatSeconds * (direction.pulse >= 0.7 ? 1 : 2);
        const roots = ["C2", "A1", "F1", "G1"];
        Array.from({ length: Math.floor(this.plan.composition.durationSeconds / pulseStep) }, (_, index) => index * pulseStep).forEach((start, index) => {
          this.transport.schedule((time) => this.pulse.triggerAttackRelease(roots[Math.floor(index / 4) % roots.length], 0.12, time, 0.1 + direction.pulse * 0.2), start);
        });
      }
    }
    this.scheduleEndingFade();
  }

  private startClock(): void {
    this.stopClock();
    this.timer = window.setInterval(() => {
      const currentTime = Math.min(this.transport.seconds, this.state.duration);
      if (currentTime >= this.state.duration) {
        this.transport.stop();
        this.stopClock();
        this.silenceAtEnd();
        this.state = { ...this.state, status: "ended", currentTime: this.state.duration, activeSoundUnitIds: [], activeCompositionEventIds: [] };
      } else {
        this.state = { ...this.state, currentTime };
      }
      this.emit();
    }, 120);
  }

  private resumeSourcesAt(currentTime: number): void {
    if (!this.plan) return;
    const secondsPerBeat = 60 / this.plan.composition.bpm;
    let childSoundActive = false;
    this.plan.composition.events.forEach((event) => {
      const player = this.eventPlayers.get(event.id);
      const filter = this.eventFilters.get(event.id);
      if (!player) return;
      const startSeconds = event.startBeat * secondsPerBeat;
      const playbackSeconds = this.eventPlaybackSeconds.get(event.id) ?? 0;
      const elapsedSeconds = currentTime - startSeconds;
      if (elapsedSeconds <= 0.001 || elapsedSeconds >= playbackSeconds) return;
      childSoundActive = true;
      const remainingSeconds = playbackSeconds - elapsedSeconds;
      const initialSourceOffset = event.sourceOffsetSeconds ?? 0;
      const selectedSourceSeconds = event.sourceSelectionDurationSeconds
        ?? Math.max(0.01, player.buffer.duration - initialSourceOffset);
      const sourceOffset = player.loop
        ? initialSourceOffset + (elapsedSeconds % Math.max(0.01, selectedSourceSeconds))
        : initialSourceOffset + elapsedSeconds;
      const now = Tone.now();
      if (filter) scheduleFilterContour(filter, event.filterMotion ?? "none", now, remainingSeconds);
      if (player.loop) player.start(now, sourceOffset, remainingSeconds);
      else player.start(now, sourceOffset, remainingSeconds);
      this.activateEvent(event.id, event.soundUnitId, remainingSeconds);
    });

    if (this.polishPlayer && currentTime > 0.001 && currentTime < this.polishPlaybackSeconds) {
      this.polishPlayer.start(Tone.now(), currentTime, this.polishPlaybackSeconds - currentTime);
    }
    if (this.state.polishEnabled) {
      const activeGains = this.plan.composition.events
        .filter((event) => this.state.activeCompositionEventIds.includes(event.id))
        .map((event) => event.gainDb);
      this.polishBus.volume.rampTo(this.polishGainDb() - (childSoundActive ? duckDepthDb(activeGains) : 0), DUCK_ATTACK_SECONDS);
    }
  }

  private resumeSymbolicBackgroundAt(currentTime: number): void {
    const events = this.plan?.composition.polishLayer?.symbolicPlan?.events ?? [];
    const now = Tone.now();
    events.forEach((event) => {
      const elapsed = currentTime - event.startSeconds;
      if (elapsed <= 0.001 || elapsed >= event.durationSeconds) return;
      const remaining = event.durationSeconds - elapsed;
      const notes = event.midiNotes.map((midi) => this.shiftedNote(midi));
      const velocity = polyphonyVelocity(event.velocity, notes.length);
      if (event.voice === "pad") this.pad.triggerAttackRelease(notes, remaining, now, velocity);
      else if (event.voice === "mallet") this.mallet.triggerAttackRelease(notes, remaining, now, velocity);
      else if (event.voice === "pluck") this.pluck.triggerAttackRelease(notes, remaining, now, velocity);
      else if (event.voice === "bass") this.bass.triggerAttackRelease(notes[0], remaining, now, event.velocity);
      else this.pulse.triggerAttackRelease(notes[0], remaining, now, event.velocity);
    });
  }

  /**
   * 儿童原声出现时背景自动退后，留白时恢复。
   * 闪避深度随这一段原声的响度变化：轻声少让、响声多让，保证原声始终可辨认。
   */
  private schedulePolishDucking(): void {
    if (!this.plan?.composition.polishLayer) return;
    const merged = this.mergedChildIntervals();
    merged.forEach((interval) => {
      const depth = duckDepthDb(interval.gains);
      this.transport.schedule(() => {
        if (this.state.polishEnabled) this.polishBus.volume.rampTo(this.polishGainDb() - depth, DUCK_ATTACK_SECONDS);
      }, interval.start);
      this.transport.schedule(() => {
        if (this.state.polishEnabled) this.polishBus.volume.rampTo(this.polishGainDb(), DUCK_RELEASE_SECONDS);
      }, interval.end);
    });
  }

  /** 儿童原声在时间轴上的实际发声区间，相邻的合并成一段。 */
  private childIntervals(): Array<{ start: number; end: number; gainDb: number }> {
    if (!this.plan) return [];
    const secondsPerBeat = 60 / this.plan.composition.bpm;
    return this.plan.composition.events.map((event) => {
      const start = event.startBeat * secondsPerBeat;
      return {
        start,
        end: Math.min(this.plan!.composition.durationSeconds, start + (this.eventPlaybackSeconds.get(event.id) ?? 0)),
        gainDb: event.gainDb,
      };
    }).filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start);
  }

  private mergedChildIntervals(): Array<{ start: number; end: number; gains: number[] }> {
    const merged: Array<{ start: number; end: number; gains: number[] }> = [];
    this.childIntervals().forEach((interval) => {
      const last = merged.at(-1);
      if (last && interval.start <= last.end + 0.08) {
        last.end = Math.max(last.end, interval.end);
        last.gains.push(interval.gainDb);
      } else {
        merged.push({ start: interval.start, end: interval.end, gains: [interval.gainDb] });
      }
    });
    return merged;
  }

  private maxSimultaneousChildSounds(): number {
    return maxSimultaneousSounds(this.childIntervals());
  }

  private activateEvent(eventId: string, soundUnitId: string, durationSeconds: number): void {
    this.state = { ...this.state, activeSoundUnitIds: this.activeSounds.activate(soundUnitId), activeCompositionEventIds: this.activeEvents.activate(eventId) };
    this.emit();
    const highlightTimer = window.setTimeout(() => {
      this.highlightTimers.delete(highlightTimer);
      this.state = { ...this.state, activeSoundUnitIds: this.activeSounds.deactivate(soundUnitId), activeCompositionEventIds: this.activeEvents.deactivate(eventId) };
      this.emit();
    }, durationSeconds * 1000);
    this.highlightTimers.add(highlightTimer);
  }

  private stopClock(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private disposeEventPlayers(): void {
    this.eventPlayers.forEach((player) => player.dispose());
    this.eventPlayers.clear();
    this.eventPitchShifters.forEach((pitchShift) => pitchShift.dispose());
    this.eventPitchShifters.clear();
    this.eventFilters.forEach((filter) => filter.dispose());
    this.eventFilters.clear();
    this.eventPlaybackSeconds.clear();
    this.polishPlayer?.dispose();
    this.polishPlayer = null;
    this.polishPlaybackSeconds = 0;
  }

  /**
   * 把这首作品的音色底色落到实际节点上：亮度决定滤波开度与起音，空间决定混响量，
   * 音区移调让背景避开孩子声音所在的音区。缺省时退回中性设置。
   */
  private applyBackgroundVoicing(): void {
    const voicing = this.plan?.composition.polishLayer?.voicing;
    const tone = backgroundToneSettings(voicing);
    this.polishTone.frequency.rampTo(tone.cutoffHz, 0.1);
    // 送多少给混响由空间量决定；干声永远直达总线，混响没准备好也不影响出声。
    this.polishSend.gain.rampTo(tone.reverbWet, 0.1);
    if (Math.abs((this.polishSpace.decay as number) - tone.reverbDecaySeconds) > 0.05) {
      this.polishSpace.decay = tone.reverbDecaySeconds;
    }
    // 保持段电平必须一起设：只改起音的话，长音仍然会趴在三分之一的位置上。
    this.pad.set({ envelope: { attack: tone.padAttackSeconds, sustain: tone.padSustainLevel } });
    this.bass.set({ envelope: { sustain: Math.min(0.7, tone.padSustainLevel) } });
    this.mallet.set({ envelope: { attack: tone.shortAttackSeconds } });
    this.pluck.set({ envelope: { attack: tone.shortAttackSeconds } });
  }

  /** 背景音符的实际音高：叠加这首作品的音区移调。 */
  private shiftedNote(midi: number): string {
    const shift = this.plan?.composition.polishLayer?.voicing?.registerShiftSemitones ?? 0;
    return Tone.Frequency(clampMidi(midi + shift), "midi").toNote();
  }

  /** 背景电平始终跟着儿童总线走，并低于它一个固定落差。 */
  private polishGainDb(): number {
    return backgroundBusGainDb(this.plan?.composition.polishLayer?.defaultGainDb ?? -16, this.maxSimultaneousChildSounds());
  }

  private scheduleEndingFade(): void {
    const duration = this.state.duration || this.plan?.composition.durationSeconds || 0;
    const fadeSeconds = endingFadeSeconds(duration);
    const fadeStart = Math.max(0, duration - fadeSeconds);
    this.transport.schedule((time) => {
      this.masterBus.volume.cancelScheduledValues(time);
      this.masterBus.volume.setValueAtTime(0, time);
      this.masterBus.volume.linearRampToValueAtTime(-60, time + fadeSeconds);
    }, fadeStart);
  }

  private silenceAtEnd(): void {
    this.clearHighlightTimers();
    this.eventPlayers.forEach((player) => {
      if (player.state === "started") player.stop();
    });
    if (this.polishPlayer?.state === "started") this.polishPlayer.stop();
    this.pad.releaseAll();
    this.pulse.triggerRelease();
    this.mallet.releaseAll();
    this.pluck.releaseAll();
    this.bass.triggerRelease();
    this.masterBus.volume.cancelScheduledValues(Tone.now());
    this.masterBus.volume.value = -Infinity;
  }

  private resetMasterBus(currentTime = 0): void {
    this.masterBus.volume.cancelScheduledValues(Tone.now());
    const duration = this.state.duration || this.plan?.composition.durationSeconds || 0;
    const fadeSeconds = endingFadeSeconds(duration);
    const fadeStart = Math.max(0, duration - fadeSeconds);
    if (currentTime <= fadeStart || fadeSeconds <= 0) {
      this.masterBus.volume.value = 0;
      return;
    }
    const progress = Math.min(1, (currentTime - fadeStart) / fadeSeconds);
    this.masterBus.volume.value = -60 * progress;
    this.masterBus.volume.linearRampToValueAtTime(-60, Tone.now() + Math.max(0.01, duration - currentTime));
  }

  private stopActiveSources(): void {
    this.eventPlayers.forEach((player) => {
      if (player.state === "started") player.stop();
    });
    if (this.polishPlayer?.state === "started") this.polishPlayer.stop();
    this.pad.releaseAll();
    this.pulse.triggerRelease();
    this.mallet.releaseAll();
    this.pluck.releaseAll();
    this.bass.triggerRelease();
  }

  private clearHighlightTimers(): void {
    this.highlightTimers.forEach((timer) => window.clearTimeout(timer));
    this.highlightTimers.clear();
    this.activeSounds.clear();
    this.activeEvents.clear();
  }
}
