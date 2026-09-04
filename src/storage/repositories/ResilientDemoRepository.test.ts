import { beforeEach, describe, expect, it } from "vitest";
import type { DemoRepository, DemoSnapshot } from "@/src/features/ports";
import { createInitialDemoSnapshot } from "@/src/features/bootstrap-demo";
import { ResilientDemoRepository } from "./ResilientDemoRepository";

/** 可以按需失败的假仓库，用来模拟浏览器存储不可用或损坏。 */
class FakeRepository implements DemoRepository {
  saved: DemoSnapshot | null = null;
  cleared = 0;
  failInitialize = false;
  failClear = false;
  failSave = false;

  async initialize(seed: DemoSnapshot): Promise<DemoSnapshot> {
    if (this.failInitialize) throw new Error("IndexedDB 打不开");
    this.saved = seed;
    return seed;
  }

  async load(): Promise<DemoSnapshot | null> {
    return this.saved;
  }

  async save(snapshot: DemoSnapshot): Promise<void> {
    if (this.failSave) throw new Error("写入失败");
    this.saved = snapshot;
  }

  async clear(): Promise<void> {
    this.cleared += 1;
    if (this.failClear) throw new Error("清空失败");
    this.saved = null;
  }

  getStatus() {
    return "persistent" as const;
  }
}

describe("浏览器存储不可用时的降级", () => {
  let seed: DemoSnapshot;
  let persistent: FakeRepository;
  let repository: ResilientDemoRepository;

  beforeEach(() => {
    seed = createInitialDemoSnapshot();
    persistent = new FakeRepository();
    repository = new ResilientDemoRepository(persistent);
  });

  it("正常情况下一直使用持久化存储", async () => {
    await repository.initialize(seed);
    expect(repository.getStatus()).toBe("persistent");

    const changed = { ...seed, currentPath: "/world" };
    await repository.save(changed);
    expect((await repository.load())?.currentPath).toBe("/world");
  });

  it("存储损坏时重装演示数据，并标记为已恢复", async () => {
    persistent.failInitialize = true;
    const snapshot = await repository.initialize(seed);

    expect(repository.getStatus()).toBe("recovered");
    expect(persistent.cleared).toBe(1);
    expect(snapshot.project.id).toBe(seed.project.id);
    // 重装用的是种子的副本，之后的修改不会污染种子。
    expect(snapshot).not.toBe(seed);
  });

  it("存储完全不可用时退到内存，创作流程不中断", async () => {
    persistent.failInitialize = true;
    persistent.failClear = true;
    await repository.initialize(seed);

    expect(repository.getStatus()).toBe("memory-fallback");

    const changed = { ...seed, currentPath: "/compose" };
    await repository.save(changed);
    expect((await repository.load())?.currentPath).toBe("/compose");
  });

  it("中途写入失败时当场切到内存，不丢当前这次改动", async () => {
    await repository.initialize(seed);
    persistent.failSave = true;

    const changed = { ...seed, currentPath: "/works/demo" };
    await repository.save(changed);

    expect(repository.getStatus()).toBe("memory-fallback");
    expect((await repository.load())?.currentPath).toBe("/works/demo");
  });

  it("清空后如果存储恢复正常，就重新使用持久化存储", async () => {
    await repository.initialize(seed);
    persistent.failSave = true;
    await repository.save({ ...seed, currentPath: "/compose" });
    expect(repository.getStatus()).toBe("memory-fallback");

    persistent.failSave = false;
    await repository.clear();

    expect(repository.getStatus()).toBe("persistent");
    expect(await repository.load()).toBeNull();
  });
});
