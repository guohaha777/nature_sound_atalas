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

export class ToneCompositionPlayer implements CompositionPlayer {
  private readonly transport = Tone.getTransport();
  private readonly limiter = new Tone.Limiter(-1).toDestination();
  private readonly originalBus = new Tone.Volume(-3).connect(this.limiter);
  private readonly polishBus = new Tone.Volume(-Infinity).connect(this.limiter);
  private readonly pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 1.4, decay: 0.8, sustain: 0.35, release: 2.5 } }).connect(this.polishBus);
  private readonly pulse = new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.015, decay: 0.14, sustain: 0.05, release: 0.22 } }).connect(this.polishBus);
  private readonly mallet = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.006, decay: 0.42, sustain: 0.04, release: 0.7 } }).connect(this.polishBus);
  private readonly pluck = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.008, decay: 0.26, sustain: 0.08, release: 0.45 } }).connect(this.polishBus);
  private readonly bass = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.025, decay: 0.28, sustain: 0.22, release: 0.55 } }).connect(this.polishBus);
  private readonly bufferCache = new AudioBufferCache<Tone.ToneAudioBuffer>(
    (url) => Tone.ToneAudioBuffer.fromUrl(url),
    (buffer) => buffer.dispose(),
    8,
  );
  private eventPlayers = new Map<string, Tone.Player>();
  private eventFilters = new Map<string, Tone.Filter>();
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
        const player = new Tone.Player({ url: buffer, fadeIn: event.fadeInSeconds ?? 0.025, fadeOut: timing.wasTrimmed ? Math.min(0.8, timing.playbackSeconds / 3) : 0.08 }).connect(filter);
        player.volume.value = event.gainDb;
        player.playbackRate = Math.pow(2, event.semitoneShift / 12);
        player.loop = timing.shouldLoop;
        this.eventPlayers.set(event.id, player);
        this.eventFilters.set(event.id, filter);
        this.eventPlaybackSeconds.set(event.id, timing.playbackSeconds);
      });
      const polishLayer = plan.composition.polishLayer;
      if (polishLayer?.audioUrl && polishLayer.audioAssetId) {
        const buffer = await this.bufferCache.get(`polish:${polishLayer.audioAssetId}`, polishLayer.audioUrl);
        this.polishPlayer = new Tone.Player({ url: buffer, fadeIn: 0.8, fadeOut: 1.2 }).connect(this.polishBus);
        this.polishPlaybackSeconds = Math.min(buffer.duration, plan.composition.durationSeconds);
      }
      const completePlaybackDuration = Math.max(
        plan.composition.durationSeconds,
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
    this.originalBus.dispose();
    this.polishBus.dispose();
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
        if (filter) this.scheduleContour(filter, event.filterMotion ?? "none", time, durationSeconds);
        if (player.loop) player.start(time, 0, durationSeconds);
        else player.start(time, 0, durationSeconds);
        Tone.getDraw().schedule(() => this.activateEvent(event.id, event.soundUnitId, durationSeconds), time);
      }, startSeconds);
    });
    this.schedulePolishDucking();

    if (this.plan.composition.polishLayer?.audioUrl && this.polishPlayer) {
      this.transport.schedule((time) => this.polishPlayer?.start(time, 0, this.polishPlaybackSeconds), 0);
    } else if (this.plan.composition.polishLayer?.symbolicPlan) {
      this.plan.composition.polishLayer.symbolicPlan.events.forEach((event) => {
        this.transport.schedule((time) => {
          const notes = event.midiNotes.map((midi) => Tone.Frequency(midi, "midi").toNote());
          if (event.voice === "pad") this.pad.triggerAttackRelease(notes, event.durationSeconds, time, event.velocity);
          else if (event.voice === "mallet") this.mallet.triggerAttackRelease(notes, event.durationSeconds, time, event.velocity);
          else if (event.voice === "pluck") this.pluck.triggerAttackRelease(notes, event.durationSeconds, time, event.velocity);
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
  }

  private startClock(): void {
    this.stopClock();
    this.timer = window.setInterval(() => {
      const currentTime = Math.min(this.transport.seconds, this.state.duration);
      if (currentTime >= this.state.duration) {
        this.transport.stop();
        this.stopClock();
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
      if (elapsedSeconds < 0 || elapsedSeconds >= playbackSeconds) return;
      childSoundActive = true;
      const remainingSeconds = playbackSeconds - elapsedSeconds;
      const playbackRate = Math.pow(2, event.semitoneShift / 12);
      const sourceOffset = player.loop
        ? (elapsedSeconds * playbackRate) % Math.max(0.01, player.buffer.duration)
        : elapsedSeconds * playbackRate;
      const now = Tone.now();
      if (filter) this.scheduleContour(filter, event.filterMotion ?? "none", now, remainingSeconds);
      if (player.loop) player.start(now, sourceOffset, remainingSeconds);
      else player.start(now, sourceOffset, remainingSeconds);
      this.activateEvent(event.id, event.soundUnitId, remainingSeconds);
    });

    if (this.polishPlayer && currentTime < this.polishPlaybackSeconds) {
      this.polishPlayer.start(Tone.now(), currentTime, this.polishPlaybackSeconds - currentTime);
    }
    if (this.state.polishEnabled) this.polishBus.volume.rampTo(this.polishGainDb() - (childSoundActive ? 5 : 0), 0.08);
  }

  /** 儿童原声出现时背景自动退后，留白时恢复；适用于音乐模型音频与音符方案。 */
  private schedulePolishDucking(): void {
    if (!this.plan?.composition.polishLayer) return;
    const secondsPerBeat = 60 / this.plan.composition.bpm;
    const intervals = this.plan.composition.events.map((event) => {
      const start = event.startBeat * secondsPerBeat;
      return { start, end: Math.min(this.plan!.composition.durationSeconds, start + (this.eventPlaybackSeconds.get(event.id) ?? 0)) };
    }).filter((interval) => interval.end > interval.start).sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    intervals.forEach((interval) => {
      const last = merged.at(-1);
      if (last && interval.start <= last.end + 0.08) last.end = Math.max(last.end, interval.end);
      else merged.push({ ...interval });
    });
    merged.forEach((interval) => {
      this.transport.schedule(() => {
        if (this.state.polishEnabled) this.polishBus.volume.rampTo(this.polishGainDb() - 5, 0.06);
      }, interval.start);
      this.transport.schedule(() => {
        if (this.state.polishEnabled) this.polishBus.volume.rampTo(this.polishGainDb(), 0.32);
      }, interval.end);
    });
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
    this.eventFilters.forEach((filter) => filter.dispose());
    this.eventFilters.clear();
    this.eventPlaybackSeconds.clear();
    this.polishPlayer?.dispose();
    this.polishPlayer = null;
    this.polishPlaybackSeconds = 0;
  }

  private polishGainDb(): number {
    return this.plan?.composition.polishLayer?.defaultGainDb ?? -16;
  }

  private scheduleContour(filter: Tone.Filter, motion: "up" | "down" | "none" | "lfo", time: number, durationSeconds: number): void {
    const frequency = filter.frequency;
    frequency.cancelScheduledValues(time);
    if (motion === "up") {
      frequency.setValueAtTime(700, time);
      frequency.exponentialRampToValueAtTime(16000, time + durationSeconds);
      return;
    }
    if (motion === "down") {
      frequency.setValueAtTime(16000, time);
      frequency.exponentialRampToValueAtTime(900, time + durationSeconds);
      return;
    }
    if (motion === "lfo") {
      const step = durationSeconds / 4;
      frequency.setValueAtTime(2400, time);
      frequency.exponentialRampToValueAtTime(12000, time + step);
      frequency.exponentialRampToValueAtTime(2200, time + step * 2);
      frequency.exponentialRampToValueAtTime(11000, time + step * 3);
      frequency.exponentialRampToValueAtTime(2600, time + durationSeconds);
      return;
    }
    frequency.setValueAtTime(18000, time);
  }

  private clearHighlightTimers(): void {
    this.highlightTimers.forEach((timer) => window.clearTimeout(timer));
    this.highlightTimers.clear();
    this.activeSounds.clear();
    this.activeEvents.clear();
  }
}
