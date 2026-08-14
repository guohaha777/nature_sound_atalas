import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { DemoRepository, DemoSnapshot } from "@/src/features/ports";
import { MOCK_ORIGINAL_AUDIO_ASSETS, MOCK_PAPER_SOUND_CARDS, MOCK_PROJECT, MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { WanwuDatabase } from "../db/WanwuDatabase";
import { DexieDemoRepository } from "./DexieDemoRepository";
import { DexiePendingCaptureRepository } from "./DexiePendingCaptureRepository";
import { ResilientDemoRepository } from "./ResilientDemoRepository";

const databases: WanwuDatabase[] = [];

function createRepository(label: string) {
  const db = new WanwuDatabase(`wanwu-test-${label}-${crypto.randomUUID()}`);
  databases.push(db);
  return { db, repository: new DexieDemoRepository(db) };
}

function createSeed(): DemoSnapshot {
  return structuredClone({
    project: MOCK_PROJECT,
    paperCards: MOCK_PAPER_SOUND_CARDS,
    cards: MOCK_SOUND_CARDS,
    audioAssets: MOCK_ORIGINAL_AUDIO_ASSETS,
    units: MOCK_SOUND_UNITS,
    composition: null,
    archivedCompositions: [],
    currentCardId: MOCK_SOUND_CARDS[0].id,
    currentPath: "/cards",
    completedSteps: [],
  });
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.delete()));
});

describe("DexieDemoRepository", () => {
  it("installs demo data idempotently without duplicate records", async () => {
    const { db, repository } = createRepository("idempotent");
    const seed = createSeed();
    await repository.initialize(seed);
    await repository.initialize({ ...seed, project: { ...seed.project, name: "不应覆盖已有项目" } });

    expect(await db.projects.count()).toBe(1);
    expect(await db.paperSoundCards.count()).toBe(2);
    expect(await db.soundCards.count()).toBe(5);
    expect(await db.audioAssets.count()).toBe(5);
    expect(await db.soundUnits.count()).toBe(5);
    expect((await repository.load())?.project.name).toBe(seed.project.name);
  });

  it("round-trips independent project records", async () => {
    const { repository } = createRepository("roundtrip");
    const seed = createSeed();
    await repository.initialize(seed);
    const changed = { ...seed, currentPath: "/world", completedSteps: ["start", "confirm"] };
    await repository.save(changed);
    expect(await repository.load()).toMatchObject({ currentPath: "/world", completedSteps: ["start", "confirm"] });
  });

  it("round-trips an explicitly archived composition and its work metadata", async () => {
    const { repository } = createRepository("saved-work-roundtrip");
    const seed = createSeed();
    const composition = {
      ...arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 4),
      title: "三年二班 · 八月的声音",
      createdAt: "2026-08-11T10:00:00.000Z",
      savedAt: "2026-08-11T10:01:00.000Z",
    };
    await repository.save({ ...seed, composition, archivedCompositions: [composition], currentPath: `/works/${composition.id}`, completedSteps: ["save"] });
    expect(await repository.load()).toMatchObject({
      currentPath: "/works/demo-composition",
      composition: { id: "demo-composition", title: "三年二班 · 八月的声音", revision: 4, savedAt: composition.savedAt },
      archivedCompositions: [{ id: "demo-composition", savedAt: composition.savedAt }],
    });
  });

  it("keeps multiple archived compositions instead of overwriting the first work", async () => {
    const { repository } = createRepository("multiple-saved-works");
    const seed = createSeed();
    const first = { ...arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 2), id: "work-one", savedAt: "2026-08-11T10:01:00.000Z" };
    const second = { ...arrangeCompositionV1(MOCK_SOUND_CARDS, MOCK_SOUND_UNITS, 3), id: "work-two", savedAt: "2026-08-11T10:02:00.000Z" };
    await repository.save({ ...seed, composition: second, archivedCompositions: [first, second], currentPath: `/works/${second.id}` });

    const restored = await repository.load();
    expect(restored?.archivedCompositions.map((item) => item.id).sort()).toEqual(["work-one", "work-two"]);
  });

  it("keeps local paper-card workflow state and demo presentation metadata after refresh", async () => {
    const { repository } = createRepository("paper-draft-roundtrip");
    const seed = createSeed();
    const localCard = {
      ...MOCK_SOUND_CARDS[0],
      id: "paper-card-local-1-sound-0",
      paperCardId: "paper-card-local-1",
      owner: "小禾",
      sourceSelectionRequired: true,
      confirmedAt: "paper-draft",
    };
    await repository.save({ ...seed, cards: [...seed.cards, localCard], currentCardId: localCard.id });

    const restored = await repository.load();
    const restoredCard = restored?.cards.find((card) => card.id === localCard.id) as typeof localCard | undefined;
    expect(restoredCard).toMatchObject({ owner: "小禾", sourceSelectionRequired: true, confirmedAt: "paper-draft" });
  });

  it("persists the pending paper-card photo independently from mock project data", async () => {
    const { db } = createRepository("pending-card-image");
    const capture = new DexiePendingCaptureRepository(db);
    const image = {
      id: "current-card-image" as const,
      acquisition: "upload" as const,
      blob: new Blob(["paper-card"], { type: "image/png" }),
      fileName: "paper-card.png",
      mimeType: "image/png",
      size: 10,
      lastModified: 1,
      createdAt: "2026-08-10T00:00:00.000Z",
    };

    await capture.saveCardImage(image);
    expect(await capture.loadCardImage()).toMatchObject({ fileName: "paper-card.png", acquisition: "upload" });
    await capture.saveContributorName("小禾");
    await capture.saveContributorName("小禾");
    expect(await capture.loadContributorNames()).toEqual(["小禾"]);
    await capture.saveRecording({ id: "recording-1", name: "操场的风", contributorName: "小禾", place: "操场", recordedAt: "2026-08-10", mimeType: "audio/webm", blob: new Blob(["sound"]), durationMs: 1200, createdAt: "2026-08-10T00:00:00.000Z" });
    expect(await capture.loadRecordings()).toHaveLength(1);
    await capture.saveLibraryItemPreference({ id: "cow", name: "远处的牛叫", hidden: false, updatedAt: "2026-08-10T00:00:00.000Z" });
    expect(await capture.loadLibraryItemPreferences()).toEqual([expect.objectContaining({ id: "cow", name: "远处的牛叫" })]);
    await capture.deleteRecording("recording-1");
    expect(await capture.loadRecordings()).toHaveLength(0);
    await capture.clearCardImage();
    expect(await capture.loadCardImage()).toBeNull();

    await capture.saveContributorName("再次记录");
    await capture.saveLibraryItemPreference({ id: "wind", name: "风", hidden: true, updatedAt: "2026-08-10T00:00:00.000Z" });
    await capture.clearAll();
    expect(await capture.loadContributorNames()).toEqual([]);
    expect(await capture.loadLibraryItemPreferences()).toEqual([]);
  });

  it("reinstalls the demo when persisted structured data is invalid", async () => {
    const { db, repository } = createRepository("recovery");
    const seed = createSeed();
    await repository.initialize(seed);
    await db.projects.put({ ...seed.project, name: "" });

    const resilient = new ResilientDemoRepository(repository);
    const recovered = await resilient.initialize(seed);
    expect(resilient.getStatus()).toBe("recovered");
    expect(recovered.project.name).toBe(seed.project.name);
    expect((await repository.load())?.project.name).toBe(seed.project.name);
  });

  it("falls back to session memory when IndexedDB is unavailable", async () => {
    const unavailable: DemoRepository = {
      initialize: async () => { throw new Error("unavailable"); },
      load: async () => { throw new Error("unavailable"); },
      save: async () => { throw new Error("unavailable"); },
      clear: async () => { throw new Error("unavailable"); },
      getStatus: () => "persistent",
    };
    const resilient = new ResilientDemoRepository(unavailable);
    const seed = createSeed();
    await resilient.initialize(seed);
    await resilient.save({ ...seed, currentPath: "/compose" });
    expect(resilient.getStatus()).toBe("memory-fallback");
    expect((await resilient.load())?.currentPath).toBe("/compose");
  });
});
