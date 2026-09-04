import { encodeWav, TRIMMED_AUDIO_MIME_TYPE } from "./encodeWav";

/**
 * 背景层不能比作品长，也不能硬切。
 *
 * 音乐模型（Fun-Music、ACE-Step 预渲染素材）都倾向于按自己的乐句长度收尾，
 * 不会正好停在 20／30／45 秒。这里把任何来源的背景音频统一压到目标时长，
 * 并在首尾做淡入淡出，避免出现"咔"的截断声盖过孩子的原声。
 */

/** 目标时长的允许缺口：源音频比作品短这么多以内，用静音补齐；超过就该拒绝这段背景。 */
export const BACKGROUND_DURATION_TOLERANCE_SECONDS = 0.75;

const DEFAULT_FADE_IN_SECONDS = 0.35;
/** 收尾比开头长：背景要先于孩子的声音退场，而不是一起停。 */
const DEFAULT_FADE_OUT_SECONDS = 1.2;

export interface BackgroundFitOptions {
  targetDurationSeconds: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
}

export interface FittedBackgroundAudio {
  blob: Blob;
  mimeType: string;
  /** 裁剪后的真实时长，等于 targetDurationSeconds。 */
  durationSeconds: number;
  sourceDurationSeconds: number;
  /** 源比目标长，尾部被切掉。 */
  trimmed: boolean;
  /** 源比目标短（在容差内），尾部补了静音。 */
  padded: boolean;
  fadeInSeconds: number;
  fadeOutSeconds: number;
}

export class BackgroundTooShortError extends Error {
  constructor(readonly sourceDurationSeconds: number, readonly targetDurationSeconds: number) {
    super(
      `背景音频只有 ${sourceDurationSeconds.toFixed(1)} 秒，短于本次 ${targetDurationSeconds} 秒作品，`
      + "已拒绝使用这段不完整背景。",
    );
    this.name = "BackgroundTooShortError";
  }
}

/**
 * 把一段背景音频裁到目标时长并加上淡入淡出。
 * 落地成 WAV，顺带让背景不再依赖模型返回的临时链接。
 */
export async function fitBackgroundAudio(
  source: Blob | ArrayBuffer,
  options: BackgroundFitOptions,
): Promise<FittedBackgroundAudio> {
  const { targetDurationSeconds } = options;
  if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds <= 0) {
    throw new Error("背景裁剪的目标时长无效。");
  }

  const bytes = source instanceof Blob ? await source.arrayBuffer() : source;
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(bytes.slice(0));
  } finally {
    void context.close();
  }

  const sourceDurationSeconds = decoded.duration;
  if (sourceDurationSeconds < targetDurationSeconds - BACKGROUND_DURATION_TOLERANCE_SECONDS) {
    throw new BackgroundTooShortError(sourceDurationSeconds, targetDurationSeconds);
  }

  const { sampleRate, numberOfChannels } = decoded;
  const targetFrames = Math.max(1, Math.round(targetDurationSeconds * sampleRate));
  const copyFrames = Math.min(decoded.length, targetFrames);

  // 短于目标时余下的帧保持为 0，等于用静音补齐尾巴。
  const channels = Array.from({ length: numberOfChannels }, (_, channel) => {
    const target = new Float32Array(targetFrames);
    target.set(decoded.getChannelData(channel).subarray(0, copyFrames));
    return target;
  });

  const { fadeInSeconds, fadeOutSeconds } = resolveFades(targetDurationSeconds, options);
  applyFades(channels, sampleRate, { fadeInSeconds, fadeOutSeconds });

  const wav = encodeWav({
    numberOfChannels,
    sampleRate,
    length: targetFrames,
    getChannelData: (channel) => channels[channel],
  });

  return {
    blob: new Blob([wav], { type: TRIMMED_AUDIO_MIME_TYPE }),
    mimeType: TRIMMED_AUDIO_MIME_TYPE,
    durationSeconds: targetFrames / sampleRate,
    sourceDurationSeconds,
    trimmed: decoded.length > targetFrames,
    padded: decoded.length < targetFrames,
    fadeInSeconds,
    fadeOutSeconds,
  };
}

/**
 * 淡入淡出用等功率（cosine）曲线而不是线性：
 * 线性淡出在背景垫这种持续音上听起来会中途"塌"一下。
 * 原地修改传入的声道数据。
 */
export function applyFades(
  channels: Float32Array[],
  sampleRate: number,
  fades: { fadeInSeconds: number; fadeOutSeconds: number },
): void {
  const frames = channels[0]?.length ?? 0;
  if (frames === 0) return;

  const fadeInFrames = Math.min(frames, Math.round(fades.fadeInSeconds * sampleRate));
  const fadeOutFrames = Math.min(frames - fadeInFrames, Math.round(fades.fadeOutSeconds * sampleRate));
  const fadeOutStart = frames - fadeOutFrames;

  // 淡出必须在最后一帧真正落到 0，否则收尾仍会有一声轻微的截断。
  const fadeOutSpan = Math.max(1, fadeOutFrames - 1);

  for (const data of channels) {
    for (let frame = 0; frame < fadeInFrames; frame += 1) {
      data[frame] *= equalPowerGain(frame / fadeInFrames);
    }
    for (let frame = fadeOutStart; frame < frames; frame += 1) {
      data[frame] *= equalPowerGain((frames - 1 - frame) / fadeOutSpan);
    }
  }
}

/** progress 0→1 对应 增益 0→1。 */
function equalPowerGain(progress: number): number {
  return Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI / 2);
}

/** 短作品（20 秒）不能用和长作品一样的收尾长度，否则一直在淡出。 */
export function resolveFades(
  targetDurationSeconds: number,
  options: Pick<BackgroundFitOptions, "fadeInSeconds" | "fadeOutSeconds">,
): { fadeInSeconds: number; fadeOutSeconds: number } {
  const requestedIn = options.fadeInSeconds ?? DEFAULT_FADE_IN_SECONDS;
  const requestedOut = options.fadeOutSeconds ?? DEFAULT_FADE_OUT_SECONDS;
  // 淡入淡出合计不超过作品的三分之一，且各自留住至少一帧的余量。
  const budget = targetDurationSeconds / 3;
  const total = requestedIn + requestedOut;
  if (total <= budget) return { fadeInSeconds: requestedIn, fadeOutSeconds: requestedOut };
  const scale = budget / total;
  return { fadeInSeconds: requestedIn * scale, fadeOutSeconds: requestedOut * scale };
}
