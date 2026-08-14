import { describe, expect, it } from "vitest";
import { compositionSchema } from "@/src/domain/composition";
import { originalAudioAssetSchema } from "@/src/domain/audio-asset";
import { soundUnitSchema } from "@/src/domain/sound-card";
import type { DemoSnapshot } from "@/src/features/ports";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { createInitialDemoSnapshot, normalizeDemoSnapshot } from "./demoSnapshot";
import type { MockSoundCard } from "@/src/mocks/mockData";

describe("normalizeDemoSnapshot", () => {
  it("upgrades a legacy single snapshot to current public contracts", () => {
    const current = createInitialDemoSnapshot();
    const legacyComposition = arrangeCompositionV1(current.cards, current.units, 2) as unknown as Record<string, unknown>;
    delete legacyComposition.projectId;
    delete legacyComposition.emotionIntent;
    delete legacyComposition.seed;
    legacyComposition.events = (legacyComposition.events as Array<Record<string, unknown>>).map((event) => {
      const copy = { ...event };
      delete copy.audioAssetId;
      return copy;
    });
    const legacy = {
      cards: current.cards.map((card) => {
        const legacyCard = { ...card } as Partial<typeof card>;
        delete legacyCard.projectId;
        delete legacyCard.paperCardId;
        delete legacyCard.entryIndex;
        return legacyCard;
      }),
      units: current.units.map((unit) => ({ id: unit.id, cardId: unit.cardId, audioAssetId: unit.originalAudioAssetId, contributionLabel: unit.contributionLabel, active: unit.active })),
      composition: legacyComposition,
      currentCardId: current.currentCardId,
      completedSteps: ["start"],
    } as unknown as DemoSnapshot;

    const upgraded = normalizeDemoSnapshot(legacy);
    expect(upgraded.paperCards[0].entryIds).toHaveLength(3);
    expect(upgraded.audioAssets.map((asset) => originalAudioAssetSchema.parse(asset))).toHaveLength(5);
    expect(upgraded.units.every((unit) => soundUnitSchema.safeParse(unit).success)).toBe(true);
    expect(compositionSchema.safeParse(upgraded.composition).success).toBe(true);
    expect(upgraded.currentPath).toBe("/cards?entry=diary");
  });

  it("keeps a locally recorded sound card, audio asset and unit after refresh", () => {
    const current = createInitialDemoSnapshot();
    const localCard = { ...current.cards[0], id: "card-recording-local-1", paperCardId: "recording-source-local-1", source: { label: "我的拍手声", normalizedKey: "recording-local-1", decisionSource: "human_confirmed" as const } };
    const localAsset = { ...current.audioAssets[0], id: "audio-recording-local-1", kind: "local_recording" as const, sourceKey: "recording-local-1", label: "我的拍手声", storageRef: "indexeddb://recording-local-1", licenseRef: "local-user-recording" };
    const localUnit = { ...current.units[0], id: "unit-recording-local-1", cardId: localCard.id, originalAudioAssetId: localAsset.id, inputMode: "recording" as const, provenance: { ...current.units[0].provenance, originalAudioAssetId: localAsset.id } };

    const restored = normalizeDemoSnapshot({ ...current, cards: [...current.cards, localCard], audioAssets: [...current.audioAssets, localAsset], units: [...current.units, localUnit], currentCardId: localCard.id });

    expect(restored.cards.some((card) => card.id === localCard.id)).toBe(true);
    expect(restored.audioAssets.some((asset) => asset.id === localAsset.id)).toBe(true);
    expect(restored.units.some((unit) => unit.id === localUnit.id)).toBe(true);
    expect(restored.currentCardId).toBe(localCard.id);
  });

  it("upgrades a legacy saved composition into the archive collection", () => {
    const current = createInitialDemoSnapshot();
    const composition = { ...arrangeCompositionV1(current.cards, current.units, 2), savedAt: "2026-08-11T10:01:00.000Z" };
    const restored = normalizeDemoSnapshot({ ...current, composition, archivedCompositions: undefined } as unknown as DemoSnapshot);
    expect(restored.archivedCompositions).toEqual([composition]);
  });

  it("repairs stale system ownership and the built-in bird display name", () => {
    const current = createInitialDemoSnapshot();
    const staleCards = current.cards.map((card) => card.id === "springbird" ? {
      ...card,
      owner: "小雨",
      ownerInitials: "XY",
      place: "学校后山",
      source: { ...card.source, label: "Springbird", decisionSource: "human_confirmed" as const },
    } : card);
    const restored = normalizeDemoSnapshot({ ...current, cards: staleCards });

    expect(restored.cards.every((card) => (card as MockSoundCard).owner === "系统" && (card as MockSoundCard).place === "系统声音库")).toBe(true);
    expect(restored.cards.find((card) => card.id === "springbird")?.source.label).toBe("树林里的鸟叫");
  });

  it("keeps a locally scanned paper card and all of its independent entries after refresh", () => {
    const current = createInitialDemoSnapshot();
    const paperCard = {
      ...current.paperCards[0],
      id: "paper-card-local-1",
      entryIds: ["paper-card-local-1-sound-0", "paper-card-local-1-sound-2"],
      imageAssetId: "current-card-image",
    };
    const localCards = paperCard.entryIds.map((id, index) => ({
      ...current.cards[index],
      id,
      paperCardId: paperCard.id,
      entryIndex: index === 0 ? 0 as const : 2 as const,
      sourceSelectionRequired: true,
      confirmedAt: "paper-draft",
    }));
    const localUnits = localCards.map((card, index) => ({
      ...current.units[index],
      id: `unit-${card.id}`,
      cardId: card.id,
      inputMode: "paper_card" as const,
    }));

    const restored = normalizeDemoSnapshot({
      ...current,
      paperCards: [...current.paperCards, paperCard],
      cards: [...current.cards, ...localCards],
      units: [...current.units, ...localUnits],
      currentCardId: localCards[0].id,
    });

    expect(restored.paperCards.find((item) => item.id === paperCard.id)?.entryIds).toEqual(paperCard.entryIds);
    expect(restored.cards.filter((card) => card.paperCardId === paperCard.id)).toHaveLength(2);
    expect(restored.units.filter((unit) => localCards.some((card) => card.id === unit.cardId))).toHaveLength(2);
  });
});
