import { encodeWav, TRIMMED_AUDIO_MIME_TYPE } from "./encodeWav";

export interface TrimmedAudio {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/**
 * 只对录入阶段的上传文件做一次性截取，落地成新的音源；
 * 声场里的胶囊选区仍然是非破坏性的，不走这条路径。
 */
export async function trimAudioBlob(
  blob: Blob,
  selection: { startSeconds: number; endSeconds: number },
): Promise<TrimmedAudio> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const startFrame = Math.max(0, Math.floor(selection.startSeconds * decoded.sampleRate));
    const endFrame = Math.min(decoded.length, Math.ceil(selection.endSeconds * decoded.sampleRate));
    const frames = Math.max(1, endFrame - startFrame);
    const slices = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel).slice(startFrame, startFrame + frames));
    const wav = encodeWav({
      numberOfChannels: decoded.numberOfChannels,
      sampleRate: decoded.sampleRate,
      length: frames,
      getChannelData: (channel) => slices[channel],
    });
    return {
      blob: new Blob([wav], { type: TRIMMED_AUDIO_MIME_TYPE }),
      mimeType: TRIMMED_AUDIO_MIME_TYPE,
      durationMs: Math.round(frames / decoded.sampleRate * 1000),
    };
  } finally {
    void context.close();
  }
}

export async function readAudioDurationSeconds(blob: Blob): Promise<number> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return decoded.duration;
  } finally {
    void context.close();
  }
}
