/** 用于截取后的音频落地格式：16 位 PCM WAV，浏览器和 IndexedDB 都能稳定回放。 */
export interface DecodedAudio {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

export const TRIMMED_AUDIO_MIME_TYPE = "audio/wav";

export function encodeWav(audio: DecodedAudio): ArrayBuffer {
  const channels = Math.max(1, audio.numberOfChannels);
  const frames = Math.max(1, audio.length);
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataLength = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  const channelData = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame] ?? 0));
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}
