import type { CompositionPlayer, PlaybackPlan, PlaybackState } from "../ports/CompositionPlayer";

// Tone.js 只在首次真实播放手势后加载，避免服务端渲染创建 AudioContext。
export class LazyToneCompositionPlayer implements CompositionPlayer {
  private inner: CompositionPlayer | null = null;
  private innerSubscription: (() => void) | null = null;
  private listeners = new Set<(state: PlaybackState) => void>();
  private state: PlaybackState = { status: "idle", currentTime: 0, duration: 0, activeSoundUnitIds: [], activeCompositionEventIds: [], polishEnabled: false, errorMessage: null };

  private async getInner(): Promise<CompositionPlayer> {
    if (!this.inner) {
      const { ToneCompositionPlayer } = await import("./ToneCompositionPlayer");
      this.inner = new ToneCompositionPlayer();
      this.innerSubscription = this.inner.subscribe((state) => {
        this.state = state;
        this.listeners.forEach((listener) => listener(state));
      });
    }
    return this.inner;
  }

  async unlock(): Promise<void> {
    try {
      await (await this.getInner()).unlock();
    } catch {
      this.setError("浏览器暂时无法启用音频，请再次点击播放。");
      throw new Error(this.state.errorMessage ?? "Audio unlock failed");
    }
  }

  async load(plan: PlaybackPlan): Promise<void> {
    this.state = { ...this.state, status: "loading", duration: plan.composition.durationSeconds, errorMessage: null };
    this.emit();
    try {
      await (await this.getInner()).load(plan);
    } catch (error) {
      if (this.state.status !== "error") this.setError(error instanceof Error ? error.message : "音频加载失败。");
      throw error;
    }
  }

  play(): void { this.inner?.play(); }
  pause(): void { this.inner?.pause(); }
  stop(): void { this.inner?.stop(); }
  setPolishEnabled(enabled: boolean): void {
    this.state = { ...this.state, polishEnabled: enabled };
    this.inner?.setPolishEnabled(enabled);
  }

  subscribe(listener: (state: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.innerSubscription?.();
    this.inner?.dispose();
    this.listeners.clear();
  }

  private setError(message: string): void {
    this.state = { ...this.state, status: "error", activeSoundUnitIds: [], activeCompositionEventIds: [], errorMessage: message };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }
}
