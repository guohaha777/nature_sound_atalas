import { describe, expect, it } from "vitest";
import { encodeWav } from "./encodeWav";

function tone(frames: number, sampleRate = 8000) {
  const data = Float32Array.from({ length: frames }, (_, index) => Math.sin(index / 8));
  return { numberOfChannels: 1, sampleRate, length: frames, getChannelData: () => data };
}

describe("wav encoder", () => {
  it("writes a RIFF/WAVE header sized for the sample data", () => {
    const buffer = encodeWav(tone(100));
    const view = new DataView(buffer);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe("RIFF");
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe("WAVE");
    expect(buffer.byteLength).toBe(44 + 100 * 2);
    expect(view.getUint32(40, true)).toBe(200);
    expect(view.getUint32(24, true)).toBe(8000);
  });

  it("clamps samples into the 16 bit range", () => {
    const loud = { numberOfChannels: 1, sampleRate: 8000, length: 2, getChannelData: () => Float32Array.from([4, -4]) };
    const view = new DataView(encodeWav(loud));
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});
