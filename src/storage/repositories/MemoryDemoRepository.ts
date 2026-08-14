import type { DemoRepository, DemoSnapshot } from "@/src/features/ports";

export class MemoryDemoRepository implements DemoRepository {
  private snapshot: DemoSnapshot | null = null;

  async initialize(seed: DemoSnapshot): Promise<DemoSnapshot> {
    if (!this.snapshot) this.snapshot = clone(seed);
    return clone(this.snapshot);
  }

  async load(): Promise<DemoSnapshot | null> {
    return this.snapshot ? clone(this.snapshot) : null;
  }

  async save(snapshot: DemoSnapshot): Promise<void> {
    this.snapshot = clone(snapshot);
  }

  async clear(): Promise<void> {
    this.snapshot = null;
  }

  getStatus() {
    return "memory-fallback" as const;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
