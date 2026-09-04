import * as Tone from "tone";
import { backgroundTailSeconds, childBusGainDb, maxSimultaneousSounds } from "@/src/audio/mixing";
import type { PlaybackPlan } from "@/src/audio/ports/CompositionPlayer";
import { resolveEventPlaybackDuration } from "@/src/audio/scheduler/resolveEventPlaybackDuration";
import { scheduleFilterContour } from "@/src/audio/scheduler/scheduleFilterContour";
import { encodeWav, TRIMMED_AUDIO_MIME_TYPE } from "./encodeWav";

export interface RenderedChildrenMix {
  blob: Blob;
  mimeType: string;
  /** 含尾巴的总长，等于作品时长 + tailSeconds。 */
  durationSeconds: number;
  /** 孩子的声音到这里为止；后面那段只有背景。 */
  arrangementDurationSeconds: number;
  tailSeconds: number;
  sampleRate: number;
  /** 参与渲染的事件数；为 0 说明编排还是空的，不该拿去生成背景。 */
  eventCount: number;
}

export class EmptyArrangementError extends Error {
  constructor() {
    super("编排里还没有声音，无法生成与之相关的背景。");
    this.name = "EmptyArrangementError";
  }
}

/**
 * 把孩子编排好的原声离线渲染成一段混音。
 *
 * 这是 AI 背景生成的输入：模型要先"听到"孩子摆出来的东西，
 * 生成的背景才会跟着编排走，而不是凭空来一段。
 *
 * 只渲染孩子这一层，不含任何已有的背景层——否则会把上一次的背景
 * 混进这一次的输入里，越叠越脏。
 *
 * 用 OfflineAudioContext 渲染：不出声、比实时快，用户察觉不到这一步。
 *
 * 尾部会多留一段静音（backgroundTailSeconds）。模型在那一段里听不到孩子的声音，
 * 只会生成背景，作品因此由背景收尾，而不是原声戛然而止。
 */
export async function renderChildrenMix(plan: PlaybackPlan): Promise<RenderedChildrenMix> {
  const { composition } = plan;
  if (composition.events.length === 0) throw new EmptyArrangementError();
  const tailSeconds = backgroundTailSeconds(composition.durationSeconds);
  const renderSeconds = composition.durationSeconds + tailSeconds;

  const secondsPerBeat = 60 / composition.bpm;
  const buffers = new Map(await Promise.all(
    Array.from(new Set(composition.events.map((event) => event.audioAssetId)), async (audioAssetId) => {
      const asset = plan.assets[audioAssetId];
      if (!asset) throw new Error(`缺少音频资产：${audioAssetId}`);
      return [audioAssetId, await Tone.ToneAudioBuffer.fromUrl(asset.url)] as const;
    }),
  ));

  // 事件时长要和实时播放算得一模一样，否则送给模型的混音和老师听到的不是同一版。
  const timings = composition.events.map((event) => {
    const buffer = buffers.get(event.audioAssetId);
    const startSeconds = event.startBeat * secondsPerBeat;
    const maximumPlaybackSeconds = Math.max(0.01, composition.durationSeconds - startSeconds);
    const timing = resolveEventPlaybackDuration(event, composition.bpm, buffer?.duration ?? 0, maximumPlaybackSeconds);
    return { event, buffer, startSeconds, timing };
  });

  // 总线电平也沿用实时播放那一套，让模型听到的响度关系与成品一致。
  const busGainDb = childBusGainDb(maxSimultaneousSounds(
    timings
      .map(({ event, startSeconds, timing }) => ({
        start: startSeconds,
        end: Math.min(composition.durationSeconds, startSeconds + timing.playbackSeconds),
        gainDb: event.gainDb,
      }))
      .filter((interval) => interval.end > interval.start)
      .sort((a, b) => a.start - b.start),
  ));

  const rendered = await Tone.Offline(({ transport }) => {
    transport.bpm.value = composition.bpm;
    const bus = new Tone.Volume(busGainDb).toDestination();
    timings.forEach(({ event, buffer, startSeconds, timing }) => {
      if (!buffer) return;
      const filter = new Tone.Filter(18000, "lowpass").connect(bus);
      // 与实时播放同样的取舍：不移调就不挂 PitchShift，避免相位声码器给原声染色。
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
      // 扫频要在这一声开始的时刻安排，和实时播放的时间基准一致。
      scheduleFilterContour(filter, event.filterMotion ?? "none", startSeconds, timing.playbackSeconds);
      player.sync().start(startSeconds, event.sourceOffsetSeconds ?? 0, timing.playbackSeconds);
    });
    transport.start(0);
  }, renderSeconds);

  return {
    blob: new Blob([encodeWav(rendered)], { type: TRIMMED_AUDIO_MIME_TYPE }),
    mimeType: TRIMMED_AUDIO_MIME_TYPE,
    durationSeconds: rendered.duration,
    arrangementDurationSeconds: composition.durationSeconds,
    tailSeconds,
    sampleRate: rendered.sampleRate,
    eventCount: composition.events.length,
  };
}
