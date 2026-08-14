/** 允许不同声音和同一声音的重叠事件同时保持高亮。 */
export class ActiveSoundTracker {
  private counts = new Map<string, number>();

  activate(soundUnitId: string): string[] {
    this.counts.set(soundUnitId, (this.counts.get(soundUnitId) ?? 0) + 1);
    return this.activeIds();
  }

  deactivate(soundUnitId: string): string[] {
    const remaining = (this.counts.get(soundUnitId) ?? 1) - 1;
    if (remaining > 0) this.counts.set(soundUnitId, remaining);
    else this.counts.delete(soundUnitId);
    return this.activeIds();
  }

  clear(): void {
    this.counts.clear();
  }

  activeIds(): string[] {
    return [...this.counts.keys()];
  }
}
