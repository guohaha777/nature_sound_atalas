import type { DemoRepository, DemoSnapshot } from "@/src/features/ports";
import { originalAudioAssetSchema } from "@/src/domain/audio-asset";
import { compositionSchema } from "@/src/domain/composition";
import { demoStateSchema, soundProjectSchema } from "@/src/domain/project";
import { confirmedSoundCardSchema, paperSoundCardSchema, soundUnitSchema } from "@/src/domain/sound-card";
import { WanwuDatabase } from "../db/WanwuDatabase";

export class DexieDemoRepository implements DemoRepository {
  constructor(private readonly db: WanwuDatabase) {}

  async initialize(seed: DemoSnapshot): Promise<DemoSnapshot> {
    const existing = await this.load();
    if (existing) return existing;
    await this.save(seed);
    return seed;
  }

  getStatus() {
    return "persistent" as const;
  }

  async load(): Promise<DemoSnapshot | null> {
    const stateRecord = await this.db.demoStates.get("current-demo");
    if (!stateRecord) {
      const legacy = await this.db.snapshots.get("current-demo");
      return legacy?.value ?? null;
    }

    const state = demoStateSchema.parse(stateRecord);
    const project = soundProjectSchema.parse(await this.db.projects.get(state.projectId));
    const [paperCards, cards, audioAssets, units, compositions] = await Promise.all([
      this.db.paperSoundCards.where("projectId").equals(state.projectId).toArray(),
      this.db.soundCards.where("projectId").equals(state.projectId).toArray(),
      this.db.audioAssets.where("projectId").equals(state.projectId).toArray(),
      this.db.soundUnits.where("projectId").equals(state.projectId).toArray(),
      this.db.compositions.where("projectId").equals(state.projectId).toArray(),
    ]);
    const composition = project.activeCompositionId
      ? compositions.find((item) => item.id === project.activeCompositionId) ?? null
      : null;

    return {
      project,
      paperCards: paperCards.map((item) => paperSoundCardSchema.parse(item)),
      // Demo 页面仍有配色、图形等展示元数据；核心字段严格校验，同时让这些非领域字段可以原样恢复。
      cards: cards.map((item) => confirmedSoundCardSchema.passthrough().parse(item)),
      audioAssets: audioAssets.map((item) => originalAudioAssetSchema.parse(item)),
      units: units.map((item) => soundUnitSchema.parse(item)),
      composition: composition ? compositionSchema.parse(composition) : null,
      archivedCompositions: compositions.filter((item) => item.savedAt).map((item) => compositionSchema.parse(item)),
      currentCardId: state.currentCardId,
      currentPath: state.currentPath,
      completedSteps: state.completedSteps,
    };
  }

  async save(snapshot: DemoSnapshot): Promise<void> {
    const updatedAt = new Date().toISOString();
    const project = {
      ...snapshot.project,
      activeCompositionId: snapshot.composition?.id ?? null,
      updatedAt,
    };
    await this.db.transaction(
      "rw",
      [this.db.projects, this.db.paperSoundCards, this.db.soundCards, this.db.audioAssets, this.db.soundUnits, this.db.compositions, this.db.demoStates],
      async () => {
        await this.db.projects.put(project);
        await this.db.paperSoundCards.bulkPut(snapshot.paperCards);
        await this.db.soundCards.bulkPut(snapshot.cards);
        await this.db.audioAssets.bulkPut(snapshot.audioAssets);
        await this.db.soundUnits.bulkPut(snapshot.units);
        if (snapshot.archivedCompositions.length) await this.db.compositions.bulkPut(snapshot.archivedCompositions);
        if (snapshot.composition) await this.db.compositions.put(snapshot.composition);
        await this.db.demoStates.put({
          id: "current-demo",
          projectId: project.id,
          currentPath: snapshot.currentPath,
          stage: pathToStage(snapshot.currentPath),
          currentCardId: snapshot.currentCardId,
          selectedSoundUnitIds: snapshot.units.filter((unit) => unit.active).map((unit) => unit.id),
          completedSteps: snapshot.completedSteps,
          updatedAt,
        });
      },
    );
  }

  async clear(): Promise<void> {
    await this.db.transaction(
      "rw",
      [this.db.snapshots, this.db.projects, this.db.paperSoundCards, this.db.soundCards, this.db.audioAssets, this.db.soundUnits, this.db.compositions, this.db.demoStates],
      async () => {
        await Promise.all([
          this.db.snapshots.clear(),
          this.db.projects.clear(),
          this.db.paperSoundCards.clear(),
          this.db.soundCards.clear(),
          this.db.audioAssets.clear(),
          this.db.soundUnits.clear(),
          this.db.compositions.clear(),
          this.db.demoStates.clear(),
        ]);
      },
    );
  }
}

function pathToStage(path: string) {
  if (path.startsWith("/works/")) return "work" as const;
  if (path === "/compose") return "compose" as const;
  if (path === "/world") return "world" as const;
  if (path.includes("/birth")) return "birth" as const;
  if (path.includes("/confirm")) return "confirm" as const;
  if (path === "/cards") return "capture" as const;
  return "entrance" as const;
}
