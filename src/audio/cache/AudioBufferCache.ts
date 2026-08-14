interface CacheEntry<T> {
  url: string;
  promise: Promise<T>;
  value: T | null;
}

/**
 * 以音频资产 ID 为主键复用已解码 Buffer。Map 的插入顺序同时作为轻量 LRU；
 * 页面切换不会清空，只有播放器销毁或超过容量时才释放最久未使用项。
 */
export class AudioBufferCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly loadBuffer: (url: string) => Promise<T>,
    private readonly disposeBuffer: (buffer: T) => void,
    private readonly maxEntries = 8,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  async get(audioAssetId: string, url: string): Promise<T> {
    const cached = this.entries.get(audioAssetId);
    if (cached?.url === url) {
      this.touch(audioAssetId, cached);
      return cached.promise;
    }
    if (cached) this.remove(audioAssetId, cached);

    const entry: CacheEntry<T> = { url, value: null, promise: Promise.resolve(null as T) };
    entry.promise = this.loadBuffer(url)
      .then((buffer) => {
        entry.value = buffer;
        this.evictOverflow();
        return buffer;
      })
      .catch((error) => {
        if (this.entries.get(audioAssetId) === entry) this.entries.delete(audioAssetId);
        throw error;
      });
    this.entries.set(audioAssetId, entry);
    return entry.promise;
  }

  clear(): void {
    this.entries.forEach((entry) => {
      if (entry.value) this.disposeBuffer(entry.value);
    });
    this.entries.clear();
  }

  private touch(audioAssetId: string, entry: CacheEntry<T>): void {
    this.entries.delete(audioAssetId);
    this.entries.set(audioAssetId, entry);
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.entries().next().value as [string, CacheEntry<T>] | undefined;
      if (!oldest) return;
      this.remove(oldest[0], oldest[1]);
    }
  }

  private remove(audioAssetId: string, entry: CacheEntry<T>): void {
    this.entries.delete(audioAssetId);
    if (entry.value) this.disposeBuffer(entry.value);
  }
}
