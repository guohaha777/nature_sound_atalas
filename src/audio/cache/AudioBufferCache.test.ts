import { describe, expect, it, vi } from "vitest";
import { AudioBufferCache } from "./AudioBufferCache";

describe("AudioBufferCache", () => {
  it("decodes the same audioAssetId only once and reuses the pending promise", async () => {
    const loader = vi.fn(async (url: string) => ({ url }));
    const cache = new AudioBufferCache(loader, vi.fn(), 4);
    const [first, second] = await Promise.all([cache.get("audio-cow", "/cow.mp3"), cache.get("audio-cow", "/cow.mp3")]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("keeps only the most recently used decoded buffers", async () => {
    const disposed: string[] = [];
    const cache = new AudioBufferCache(async (url: string) => ({ url }), (buffer) => disposed.push(buffer.url), 2);
    await cache.get("cow", "/cow.mp3");
    await cache.get("wind", "/wind.mp3");
    await cache.get("cow", "/cow.mp3");
    await cache.get("bird", "/bird.mp3");
    expect(cache.size).toBe(2);
    expect(disposed).toEqual(["/wind.mp3"]);
  });

  it("releases all decoded buffers when the shared player is disposed", async () => {
    const dispose = vi.fn();
    const cache = new AudioBufferCache(async (url: string) => ({ url }), dispose, 4);
    await cache.get("cow", "/cow.mp3");
    await cache.get("wind", "/wind.mp3");
    cache.clear();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });
});
