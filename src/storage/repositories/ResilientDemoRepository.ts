import type { DemoRepository, DemoSnapshot, RepositoryStatus } from "@/src/features/ports";
import { MemoryDemoRepository } from "./MemoryDemoRepository";

/** IndexedDB损坏时重装演示；IndexedDB不可用时退到当前会话内存。 */
export class ResilientDemoRepository implements DemoRepository {
  private status: RepositoryStatus = "persistent";
  private readonly memory = new MemoryDemoRepository();

  constructor(private readonly persistent: DemoRepository) {}

  async initialize(seed: DemoSnapshot): Promise<DemoSnapshot> {
    try {
      const snapshot = await this.persistent.initialize(seed);
      this.status = "persistent";
      return snapshot;
    } catch {
      try {
        await this.persistent.clear();
        await this.persistent.save(seed);
        this.status = "recovered";
        return structuredClone(seed);
      } catch {
        this.status = "memory-fallback";
        return this.memory.initialize(seed);
      }
    }
  }

  async load(): Promise<DemoSnapshot | null> {
    return this.status === "memory-fallback" ? this.memory.load() : this.persistent.load();
  }

  async save(snapshot: DemoSnapshot): Promise<void> {
    if (this.status === "memory-fallback") {
      await this.memory.save(snapshot);
      return;
    }
    try {
      await this.persistent.save(snapshot);
    } catch {
      this.status = "memory-fallback";
      await this.memory.save(snapshot);
    }
  }

  async clear(): Promise<void> {
    await this.memory.clear();
    try {
      await this.persistent.clear();
      this.status = "persistent";
    } catch {
      this.status = "memory-fallback";
    }
  }

  getStatus(): RepositoryStatus {
    return this.status;
  }
}
