"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { AIPolishLayer, Composition, CompositionTeachingAdvice, EmotionIntent } from "@/src/domain/composition";
import { arrangeCompositionV2, attachCompositionContext } from "@/src/domain/composition";
import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { ConfirmedSoundCard, ContourChoice, DurationChoice, IntensityChoice, PaperSoundCard, PatternChoice, PitchChoice, SoundUnit } from "@/src/domain/sound-card";
import { LazyToneCompositionPlayer, type PlaybackState } from "@/src/audio";
import { createInitialDemoSnapshot, normalizeDemoSnapshot } from "@/src/features/bootstrap-demo";
import { buildSoundBirthPreview, canPlaySoundCard } from "@/src/features/sound-birth";
import { deleteWorldCompositionEvent, duplicateWorldCompositionEvent, durationOptionFitsUserClips, minimumCompositionSecondsForUserClips, moveWorldCompositionEvent, normalizeEditableSourceClips, updateCompositionEventSourceClip, updateWorldComposition, type WorldArrangementValues } from "@/src/features/sound-world";
import { buildCompositionAdviceBrief, stableAdviceHash } from "@/src/features/composition-advice";
import { buildExperienceRoute } from "@/src/features/start-demo/buildExperienceRoute";
import { coordinateCompositionArrangement } from "@/src/features/teaching-agent";
import { PAGE_TRANSITION_EVENT, PageTransitionIndicator } from "@/src/features/page-transition";
import { ensureNaturalSoundContinuity, recommendCompositionDuration, resizeCompositionDuration, smallestDurationOptionFor, type CompositionDurationSeconds } from "@/src/features/composition-duration";
import type { CardImageAcquisition, CompositionAdvicePort, DemoRepository, DemoSnapshot, LibraryItemPreference, PendingCardImage, PendingCaptureRepository, PolishGenerationPort, StoredRecording } from "@/src/features/ports";
import type { MockSoundCard } from "@/src/mocks/mockData";
import { HybridCompositionAdvisor } from "@/src/services/composition-advice/HybridCompositionAdvisor";
import { AceStepPolishGenerator } from "@/src/services/acestep/AceStepPolishGenerator";
import { DexieDemoRepository, DexiePendingCaptureRepository, ResilientDemoRepository, WanwuDatabase } from "@/src/storage";

type PolishStatus = "idle" | "requesting" | "ready" | "failed" | "declined" | "fallback";
type CompositionAdviceStatus = "idle" | "requesting" | "ready" | "fallback";
type PersistenceStatus = "loading" | "ready" | "recovered" | "memory-fallback" | "error";

interface PaperSoundDraftEntryInput {
  entryIndex: 0 | 1 | 2;
  sourceLabel: string;
  pitch: PitchChoice;
  duration: DurationChoice;
  contour: ContourChoice;
  intensity: IntensityChoice;
  pattern: PatternChoice;
  confidence: "high" | "review";
}

interface PaperSoundDraftBatchInput {
  entries: PaperSoundDraftEntryInput[];
  contributorName: string;
  place: string;
  recordedAt: string;
  originalCardAssetId: string;
}

type LibrarySourceSelection =
  | { kind: "asset"; id: string }
  | { kind: "recording"; id: string; recording?: StoredRecording };

interface ExperienceContextValue {
  projectName: string;
  cards: MockSoundCard[];
  paperCards: PaperSoundCard[];
  audioAssets: OriginalAudioAsset[];
  audioPlaybackUrls: Record<string, string>;
  units: SoundUnit[];
  composition: Composition | null;
  archivedCompositions: Composition[];
  currentCard: MockSoundCard;
  playback: PlaybackState;
  polishStatus: PolishStatus;
  compositionAdviceStatus: CompositionAdviceStatus;
  polishErrorMessage: string | null;
  persistenceStatus: PersistenceStatus;
  hydrated: boolean;
  resumePath: string;
  completedSteps: string[];
  pendingCardImage: PendingCardImage | null;
  contributorNames: string[];
  recordings: StoredRecording[];
  libraryItemPreferences: LibraryItemPreference[];
  startDemo(): Promise<void>;
  savePendingCardImage(file: File, acquisition: CardImageAcquisition): Promise<void>;
  registerContributorName(name: string): Promise<void>;
  saveRecording(recording: StoredRecording): Promise<void>;
  createPaperSoundDrafts(input: PaperSoundDraftBatchInput): string[];
  bindCardToLibrarySource(cardId: string, source: LibrarySourceSelection): void;
  renameLibraryItem(id: string, name: string): Promise<void>;
  deleteLibraryItem(id: string): Promise<void>;
  selectRecording(id: string): void;
  selectCard(id: string): void;
  updateCurrentCard(patch: Partial<Pick<ConfirmedSoundCard, "pitch" | "duration" | "contour" | "intensity" | "pattern">> & { sourceLabel?: string }): void;
  confirmCurrentCard(cardId?: string): void;
  toggleUnit(id: string): void;
  setActiveUnits(ids: string[]): void;
  updateWorldArrangement(soundUnitId: string, patch: Partial<WorldArrangementValues>): void;
  moveWorldEvent(eventId: string, patch: { startBeat?: number; pitch?: PitchChoice }): void;
  duplicateWorldEvent(eventId: string): void;
  deleteWorldEvent(eventId: string): void;
  updateWorldEventClip(eventId: string, selection: { startSeconds: number; endSeconds: number }, options?: { expandWorkToFit?: boolean }): void;
  playCard(id: string, options?: { fullOriginal?: boolean; allowDraft?: boolean }): Promise<void>;
  prepareComposition(): Composition;
  playComposition(options?: { includePolish?: boolean; excludeGeneratedSupport?: boolean }): Promise<void>;
  playArchivedComposition(id: string): Promise<void>;
  seekPlayback(seconds: number): Promise<void>;
  pausePlayback(): void;
  togglePolish(enabled: boolean): void;
  generatePolish(useFallback?: boolean): Promise<boolean>;
  requestCompositionAdvice(): Promise<void>;
  dismissPolishFailure(): void;
  cyclePattern(cardId: string): void;
  setCompositionEmotion(label: EmotionIntent["label"]): void;
  setCompositionEmotionPoint(input: { valence: number; arousal: number; label: Exclude<EmotionIntent["label"], null> }): void;
  setCompositionDuration(seconds: CompositionDurationSeconds): void;
  saveWork(): Promise<string | null>;
  resetDemo(): Promise<void>;
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function CompositionRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const currentRoute = buildExperienceRoute(pathname, search);
  const [database] = useState(() => new WanwuDatabase());
  const [repository] = useState<DemoRepository>(() => new ResilientDemoRepository(new DexieDemoRepository(database)));
  const [captureRepository] = useState<PendingCaptureRepository>(() => new DexiePendingCaptureRepository(database));
  const [player] = useState(() => new LazyToneCompositionPlayer());
  const [compositionAdvisor] = useState<CompositionAdvicePort>(() => new HybridCompositionAdvisor());
  const loadedPlanRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const [snapshot, setSnapshot] = useState<DemoSnapshot>(createInitialDemoSnapshot);
  const [pendingCardImage, setPendingCardImage] = useState<PendingCardImage | null>(null);
  const [savedContributorNames, setSavedContributorNames] = useState<string[]>([]);
  const [recordings, setRecordings] = useState<StoredRecording[]>([]);
  const [libraryItemPreferences, setLibraryItemPreferences] = useState<LibraryItemPreference[]>([]);
  const snapshotRef = useRef(snapshot);
  const [hydrated, setHydrated] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>("loading");
  const [polishStatus, setPolishStatus] = useState<PolishStatus>("idle");
  const [compositionAdviceStatus, setCompositionAdviceStatus] = useState<CompositionAdviceStatus>("idle");
  const [polishErrorMessage, setPolishErrorMessage] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ status: "idle", currentTime: 0, duration: 0, activeSoundUnitIds: [], activeCompositionEventIds: [], polishEnabled: false, errorMessage: null });

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const seed = createInitialDemoSnapshot();
      try {
        const stored = await repository.initialize(seed);
        let normalized: DemoSnapshot;
        let status = repositoryStatusToUi(repository.getStatus());
        try {
          normalized = normalizeDemoSnapshot(stored);
        } catch {
          await repository.clear();
          await repository.save(seed);
          normalized = seed;
          status = repository.getStatus() === "memory-fallback" ? "memory-fallback" : "recovered";
        }
        const [storedCardImage, storedContributorNames, storedRecordings, storedLibraryItemPreferences] = await Promise.all([
          captureRepository.loadCardImage().catch(() => null),
          captureRepository.loadContributorNames().catch(() => []),
          captureRepository.loadRecordings().catch(() => []),
          captureRepository.loadLibraryItemPreferences().catch(() => []),
        ]);
        if (!active) return;
        setSnapshot(normalized);
        setPendingCardImage(storedCardImage);
        setSavedContributorNames(storedContributorNames);
        setRecordings(storedRecordings);
        setLibraryItemPreferences(storedLibraryItemPreferences);
        setPersistenceStatus(status);
      } catch {
        if (active) setPersistenceStatus("error");
      } finally {
        if (active) setHydrated(true);
      }
    })();
    const unsubscribe = player.subscribe(setPlayback);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [captureRepository, player, repository]);

  useEffect(() => {
    const stopForNavigation = () => {
      player.stop();
      loadedPlanRef.current = null;
    };
    window.addEventListener(PAGE_TRANSITION_EVENT, stopForNavigation);
    return () => window.removeEventListener(PAGE_TRANSITION_EVENT, stopForNavigation);
  }, [player]);

  useEffect(() => {
    player.stop();
    loadedPlanRef.current = null;
  }, [currentRoute, player]);

  useEffect(() => {
    if (!hydrated) return;
    const snapshotToSave = pathname === "/" ? snapshot : { ...snapshot, currentPath: currentRoute };
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => repository.save(snapshotToSave))
      .then(() => setPersistenceStatus(repositoryStatusToUi(repository.getStatus())))
      .catch(() => setPersistenceStatus("error"));
  }, [currentRoute, hydrated, pathname, repository, snapshot]);

  useEffect(() => {
    if (!hydrated || !snapshot.composition || snapshot.composition.contextAnalysis) return;
    // 一次性兼容旧存档：补写后台分析，不增加用户操作。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapshot((current) => current.composition && !current.composition.contextAnalysis ? {
      ...current,
      composition: attachCompositionContext(current.composition, current.units, "preserve-child-arrangement"),
    } : current);
  }, [hydrated, snapshot.composition, snapshot.units]);

  useEffect(() => {
    const composition = snapshot.composition;
    if (!composition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompositionAdviceStatus("idle");
      return;
    }
    if (composition.teachingAdvice?.compositionRevision !== composition.revision && compositionAdviceStatus !== "requesting") {
      setCompositionAdviceStatus("idle");
    }
  }, [compositionAdviceStatus, snapshot.composition]);

  const cards = snapshot.cards as MockSoundCard[];
  const currentCard = cards.find((card) => card.id === snapshot.currentCardId) ?? cards[0];
  const contributorNames = useMemo(() => Array.from(new Set([
    "小雨",
    "敏敏",
    ...savedContributorNames,
    ...cards.filter((card) => card.owner !== "系统").map((card) => card.owner),
  ].map((name) => name.trim()).filter(Boolean))), [cards, savedContributorNames]);

  const complete = useCallback((step: string) => {
    setSnapshot((current) => current.completedSteps.includes(step) ? current : { ...current, completedSteps: [...current.completedSteps, step] });
  }, []);

  const startDemo = useCallback(async () => {
    player.stop();
    loadedPlanRef.current = null;
    setPolishStatus("idle");
    setCompositionAdviceStatus("idle");
    await captureRepository.clearCardImage().catch(() => undefined);
    setPendingCardImage(null);
    const current = snapshotRef.current;
    const next: DemoSnapshot = {
      ...current,
      project: { ...current.project, activeCompositionId: null, updatedAt: new Date().toISOString() },
      composition: null,
      units: current.units.map((unit) => ({ ...unit, active: false })),
      currentPath: "/cards?entry=diary",
      completedSteps: ["start"],
    };
    snapshotRef.current = next;
    setSnapshot(next);
    await repository.save(next);
  }, [captureRepository, player, repository]);

  const savePendingCardImage = useCallback(async (file: File, acquisition: CardImageAcquisition) => {
    const image: PendingCardImage = {
      id: "current-card-image",
      acquisition,
      blob: file,
      fileName: file.name || `${acquisition}-sound-card.jpg`,
      mimeType: file.type || "image/jpeg",
      size: file.size,
      lastModified: file.lastModified,
      createdAt: new Date().toISOString(),
    };
    setPendingCardImage(image);
    await captureRepository.saveCardImage(image).catch(() => undefined);
  }, [captureRepository]);

  const registerContributorName = useCallback(async (name: string) => {
    const normalized = name.trim();
    if (!normalized) return;
    setSavedContributorNames((current) => current.includes(normalized) ? current : [...current, normalized]);
    await captureRepository.saveContributorName(normalized).catch(() => undefined);
  }, [captureRepository]);

  const saveRecording = useCallback(async (recording: StoredRecording) => {
    setRecordings((current) => [recording, ...current.filter((item) => item.id !== recording.id)]);
    await captureRepository.saveRecording(recording);
  }, [captureRepository]);

  const createPaperSoundDrafts = useCallback((input: PaperSoundDraftBatchInput) => {
    const batchId = `${Date.now()}-${input.entries.map((entry) => entry.entryIndex).join("")}`;
    const paperCardId = `paper-card-local-${batchId}`;
    const cardIds = input.entries.map((entry) => `${paperCardId}-sound-${entry.entryIndex}`);
    const creatures: MockSoundCard["creatureKind"][] = ["cow", "rain", "steps"];
    const colors = ["#d6b14d", "#8fa8aa", "#cb9184"];
    const accents = ["#715d3d", "#566f73", "#765548"];
    const createdAt = new Date().toISOString();

    setSnapshot((current) => {
      const draftCards: MockSoundCard[] = input.entries.map((entry, index) => ({
        id: cardIds[index],
        projectId: current.project.id,
        paperCardId,
        entryIndex: entry.entryIndex,
        displayName: entry.sourceLabel,
        owner: input.contributorName,
        ownerInitials: input.contributorName.slice(0, 2),
        place: input.place,
        recordedAt: input.recordedAt,
        source: { label: entry.sourceLabel, normalizedKey: `unbound-${cardIds[index]}`, decisionSource: "human_confirmed" },
        pitch: entry.pitch,
        duration: entry.duration,
        contour: entry.contour,
        intensity: entry.intensity,
        pattern: entry.pattern,
        templateVersion: "sound-card-v1",
        confirmedAt: "paper-draft",
        creatureKind: creatures[index % creatures.length],
        color: colors[index % colors.length],
        accent: accents[index % accents.length],
        candidates: [entry.sourceLabel],
        childNote: entry.confidence === "high" ? "固定区域圈选清楚，等待确认声音来源。" : "部分圈选需要老师复核，并确认声音来源。",
        attribution: `${input.contributorName} · 纸质声卡`,
        sourceSelectionRequired: true,
        recognition: {
          method: "local_template",
          provider: "paper-sound-card-v1",
          model: null,
          confidence: entry.confidence,
          score: null,
          reason: entry.confidence === "high"
            ? "固定模板的五组圈选区分较清楚；声音名称和真实音源仍由老师或孩子确认。"
            : "至少一组圈选结果接近或不完整，需要老师逐项核对后继续。",
          teacherConfirmed: false,
          confirmedAt: null,
        },
        audioRecipe: { instrument: "drum", baseNote: "C4" },
      }));
      const draftUnits: SoundUnit[] = draftCards.map((card) => ({
        id: `unit-${card.id}`,
        projectId: current.project.id,
        cardId: card.id,
        originalAudioAssetId: "audio-wind",
        inputMode: "paper_card",
        parameters: { pitch: card.pitch, duration: card.duration, contour: card.contour, intensity: card.intensity, pattern: card.pattern },
        provenance: {
          contributorId: `local-${encodeURIComponent(input.contributorName)}`,
          contributorName: input.contributorName,
          originalCardAssetId: input.originalCardAssetId,
          originalAudioAssetId: "audio-wind",
          recordedAt: input.recordedAt,
          place: input.place,
          archiveScopes: ["personal", "classroom"],
        },
        contributionLabel: input.contributorName,
        active: true,
        mappingVersion: "music-mapping-v1",
        createdAt,
      }));
      return {
        ...current,
        paperCards: [...current.paperCards, {
          id: paperCardId,
          projectId: current.project.id,
          contributorId: `local-${encodeURIComponent(input.contributorName)}`,
          entryIds: cardIds,
          maxEntries: 3,
          imageAssetId: input.originalCardAssetId,
          templateVersion: "paper-sound-card-v1",
          createdAt,
        }],
        cards: [...current.cards, ...draftCards],
        units: [...current.units, ...draftUnits],
        currentCardId: cardIds[0],
        completedSteps: current.completedSteps.includes("capture") ? current.completedSteps : [...current.completedSteps, "capture"],
      };
    });
    return cardIds;
  }, []);

  const bindCardToLibrarySource = useCallback((cardId: string, source: LibrarySourceSelection) => {
    setSnapshot((current) => {
      let sourceAsset = source.kind === "asset" ? current.audioAssets.find((asset) => asset.id === source.id) : undefined;
      let sourceLabel = sourceAsset?.label ?? "";
      let sourceKey = sourceAsset?.sourceKey ?? "";
      let audioAssets = current.audioAssets;

      if (source.kind === "recording") {
        const recording = source.recording ?? recordings.find((item) => item.id === source.id);
        if (!recording) return current;
        const audioAssetId = `audio-${recording.id}`;
        sourceAsset = current.audioAssets.find((asset) => asset.id === audioAssetId) ?? createRecordingAudioAsset(recording, current.project.id);
        sourceLabel = recording.name;
        sourceKey = recording.id;
        if (!current.audioAssets.some((asset) => asset.id === sourceAsset!.id)) audioAssets = [...current.audioAssets, sourceAsset];
      }

      if (!sourceAsset) return current;
      const cards = current.cards.map((card) => card.id === cardId ? {
        ...card,
        source: { label: sourceLabel, normalizedKey: sourceKey, decisionSource: "human_confirmed" as const },
        candidates: [sourceLabel],
        sourceSelectionRequired: false,
      } : card) as MockSoundCard[];
      const units = current.units.map((unit) => unit.cardId === cardId ? {
        ...unit,
        originalAudioAssetId: sourceAsset!.id,
        provenance: { ...unit.provenance, originalAudioAssetId: sourceAsset!.id },
      } : unit);
      return { ...current, cards, units, audioAssets, currentCardId: cardId };
    });
  }, [recordings]);

  const renameLibraryItem = useCallback(async (id: string, name: string) => {
    const normalized = name.trim();
    if (!normalized) return;
    const recording = recordings.find((item) => item.id === id);
    if (recording) {
      const updated = { ...recording, name: normalized };
      setRecordings((current) => current.map((item) => item.id === id ? updated : item));
      await captureRepository.saveRecording(updated);
      setSnapshot((current) => ({ ...current, cards: current.cards.map((card) => card.id === `card-${id}` ? { ...card, source: { ...card.source, label: normalized, decisionSource: "human_confirmed" as const } } : card), audioAssets: current.audioAssets.map((asset) => asset.id === `audio-${id}` ? { ...asset, label: normalized } : asset) }));
      return;
    }
    setSnapshot((current) => ({ ...current, cards: current.cards.map((card) => card.id === id ? { ...card, source: { ...card.source, label: normalized, decisionSource: "human_confirmed" as const } } : card) }));
    const preference = { id, name: normalized, hidden: false, updatedAt: new Date().toISOString() };
    setLibraryItemPreferences((current) => [...current.filter((item) => item.id !== id), preference]);
    await captureRepository.saveLibraryItemPreference(preference);
  }, [captureRepository, recordings]);

  const deleteLibraryItem = useCallback(async (id: string) => {
    if (recordings.some((item) => item.id === id)) {
      setRecordings((current) => current.filter((item) => item.id !== id));
      await captureRepository.deleteRecording(id);
      setSnapshot((current) => ({
        ...current,
        currentCardId: current.currentCardId === `card-${id}` ? current.cards[0].id : current.currentCardId,
        cards: current.cards.filter((card) => card.id !== `card-${id}`),
        audioAssets: current.audioAssets.filter((asset) => asset.id !== `audio-${id}`),
        units: current.units.filter((unit) => unit.id !== `unit-${id}`),
      }));
      return;
    }
    const existing = libraryItemPreferences.find((item) => item.id === id);
    const preference = { id, name: existing?.name ?? null, hidden: true, updatedAt: new Date().toISOString() };
    setLibraryItemPreferences((current) => [...current.filter((item) => item.id !== id), preference]);
    await captureRepository.saveLibraryItemPreference(preference);
  }, [captureRepository, libraryItemPreferences, recordings]);

  const selectRecording = useCallback((id: string) => {
    const recording = recordings.find((item) => item.id === id);
    if (!recording) return;
    const cardId = `card-${recording.id}`;
    const audioAssetId = `audio-${recording.id}`;
    const unitId = `unit-${recording.id}`;
    setSnapshot((current) => {
      const existingCard = current.cards.find((card) => card.id === cardId);
      const card: MockSoundCard = existingCard ? existingCard as MockSoundCard : {
        id: cardId,
        projectId: current.project.id,
        paperCardId: `recording-source-${recording.id}`,
        entryIndex: 0,
        owner: recording.contributorName,
        ownerInitials: recording.contributorName.slice(0, 2),
        place: recording.place,
        recordedAt: recording.recordedAt,
        source: { label: recording.name, normalizedKey: recording.id, decisionSource: "human_confirmed" },
        pitch: "mid",
        duration: recording.durationMs >= 4000 ? "long" : recording.durationMs <= 1200 ? "short" : "medium",
        contour: "flat",
        intensity: "medium",
        pattern: "once",
        templateVersion: "sound-card-v1",
        confirmedAt: "recording-draft",
        creatureKind: "steps",
        color: "#cf8a54",
        accent: "#8f4e2d",
        candidates: [recording.name],
        childNote: "这是刚刚录下并保存进声音库的原始声音。",
        attribution: `${recording.contributorName} · 本地录音`,
        audioRecipe: { instrument: "drum", baseNote: "C4" },
      };
      return {
        ...current,
        currentCardId: cardId,
        cards: existingCard ? current.cards : [...current.cards, card],
        audioAssets: current.audioAssets.some((asset) => asset.id === audioAssetId) ? current.audioAssets : [...current.audioAssets, {
          id: audioAssetId,
          projectId: current.project.id,
          kind: "local_recording",
          sourceKey: recording.id,
          label: recording.name,
          storageRef: `indexeddb://${recording.id}`,
          mimeType: recording.mimeType,
          durationMs: Math.max(1, recording.durationMs),
          byteLength: Math.max(1, recording.blob.size),
          sha256: "0".repeat(64),
          licenseRef: "local-user-recording",
          createdAt: recording.createdAt,
        }],
        units: current.units.some((unit) => unit.id === unitId) ? current.units : [...current.units, {
          id: unitId,
          projectId: current.project.id,
          cardId,
          originalAudioAssetId: audioAssetId,
          inputMode: "recording",
          parameters: { pitch: card.pitch, duration: card.duration, contour: card.contour, intensity: card.intensity, pattern: card.pattern },
          provenance: {
            contributorId: `local-${recording.contributorName}`,
            contributorName: recording.contributorName,
            originalCardAssetId: null,
            originalAudioAssetId: audioAssetId,
            recordedAt: recording.recordedAt,
            place: recording.place,
            archiveScopes: ["personal", "classroom"],
          },
          contributionLabel: recording.contributorName,
          active: true,
          mappingVersion: "music-mapping-v1",
          createdAt: recording.createdAt,
        }],
      };
    });
  }, [recordings]);

  const selectCard = useCallback((id: string) => {
    setSnapshot((current) => ({ ...current, currentCardId: id }));
  }, []);

  const updateCurrentCard: ExperienceContextValue["updateCurrentCard"] = useCallback((patch) => {
    setSnapshot((current) => {
      const cards = current.cards.map((card) => card.id === current.currentCardId ? {
        ...card,
        ...patch,
        source: patch.sourceLabel ? { ...card.source, label: patch.sourceLabel, decisionSource: "human_confirmed" as const } : card.source,
      } : card);
      const updatedCard = cards.find((card) => card.id === current.currentCardId)!;
      const units = current.units.map((unit) => unit.cardId === updatedCard.id ? {
        ...unit,
        parameters: { pitch: updatedCard.pitch, duration: updatedCard.duration, contour: updatedCard.contour, intensity: updatedCard.intensity, pattern: updatedCard.pattern },
      } : unit);
      return { ...current, cards, units };
    });
  }, []);

  const confirmCurrentCard = useCallback((cardId?: string) => {
    const confirmedAt = new Date().toISOString();
    setSnapshot((current) => {
      const completedSteps = [...new Set([...current.completedSteps, "confirm", "birth"])];
      return {
        ...current,
        completedSteps,
        cards: current.cards.map((card) => card.id === (cardId ?? current.currentCardId) ? {
          ...card,
          confirmedAt,
          recognition: card.recognition ? { ...card.recognition, teacherConfirmed: true, confirmedAt } : undefined,
          source: { ...card.source, decisionSource: "human_confirmed" },
        } : card),
      };
    });
  }, []);

  const recordingPlaybackUrls = useMemo(() => Object.fromEntries(recordings.map((recording) => [recording.id, URL.createObjectURL(recording.blob)])), [recordings]);
  useEffect(() => () => Object.values(recordingPlaybackUrls).forEach((url) => URL.revokeObjectURL(url)), [recordingPlaybackUrls]);
  const playbackAssets = useMemo(() => Object.fromEntries(snapshot.audioAssets.map((asset) => {
    const recordingId = asset.storageRef.startsWith("indexeddb://") ? asset.storageRef.slice("indexeddb://".length) : null;
    return [asset.id, { id: asset.id, url: recordingId ? recordingPlaybackUrls[recordingId] ?? asset.storageRef : asset.storageRef, sourceKey: asset.sourceKey }];
  })), [recordingPlaybackUrls, snapshot.audioAssets]);
  const audioPlaybackUrls = useMemo(() => Object.fromEntries(Object.entries(playbackAssets).map(([id, asset]) => [id, asset.url])), [playbackAssets]);

  // 背景生成要先把编排渲染成音频送给模型，所以它得拿到当前的音频资产表。
  // 生成器本身不持有状态，随资产表一起重建即可——比在 useState 里构造一次
  // 再想办法把新资产传进去简单，也不会留下一份过期的闭包。
  const polish = useMemo<PolishGenerationPort>(
    () => new AceStepPolishGenerator((composition) => ({ composition, assets: playbackAssets })),
    [playbackAssets],
  );

  const playCard = useCallback(async (id: string, options?: { fullOriginal?: boolean; allowDraft?: boolean }) => {
    const card = cards.find((item) => item.id === id);
    const unit = snapshot.units.find((item) => item.cardId === id);
    if (!card || !unit) return;
    const asset = snapshot.audioAssets.find((item) => item.id === unit.originalAudioAssetId);
    if (!canPlaySoundCard(card, asset, options?.allowDraft)) return;
    if (!asset) return;
    const preview = buildSoundBirthPreview(card, unit, asset, options);
    const parameterKey = [card.pitch, card.duration, card.contour, card.intensity, card.pattern].join(":");
    const planKey = `${preview.id}:${preview.revision}:${parameterKey}:none`;
    if (loadedPlanRef.current === planKey && playback.status === "playing") {
      player.pause();
      return;
    }
    try {
      await player.unlock();
      if (loadedPlanRef.current !== planKey || playback.status === "error") {
        await player.load({ composition: preview, assets: playbackAssets });
        loadedPlanRef.current = planKey;
      }
      player.play();
      complete("birth");
    } catch {
      loadedPlanRef.current = null;
    }
  }, [cards, complete, playback.status, playbackAssets, player, snapshot.audioAssets, snapshot.units]);

  const prepareComposition = useCallback(() => {
    const recommendation = recommendCompositionDuration(snapshot.units, snapshot.audioAssets);
    const existing = snapshot.composition;
    // 推荐时长不能剪短儿童已经选好的声音片段。
    const minimumUserClipSeconds = minimumCompositionSecondsForUserClips(existing);
    const requestedDuration: CompositionDurationSeconds = existing?.durationRecommendation
      ? existing.durationSeconds as CompositionDurationSeconds
      : recommendation.seconds;
    const targetDuration: CompositionDurationSeconds = requestedDuration + 0.001 >= minimumUserClipSeconds
      ? requestedDuration
      : smallestDurationOptionFor(minimumUserClipSeconds) ?? requestedDuration;
    const shouldUpgradeUntouchedV1 = existing?.arrangerVersion === "arranger-v1"
      && existing.contextAnalysis?.decision === "run-deterministic-arranger"
      && !existing.savedAt;
    const base = shouldUpgradeUntouchedV1
      ? arrangeCompositionV2(cards, snapshot.units, existing.revision + 1, targetDuration, existing.seed)
      : existing
      ? targetDuration === existing.durationSeconds ? existing : resizeCompositionDuration(existing, targetDuration)
      : attachCompositionContext(
        arrangeCompositionV2(cards, snapshot.units, 1, targetDuration),
        snapshot.units,
        "run-deterministic-arranger",
      );
    const decision = existing?.contextAnalysis?.decision ?? "run-deterministic-arranger";
    const continuous = ensureNaturalSoundContinuity({
      ...base,
      durationRecommendation: recommendation,
    }, snapshot.units, snapshot.audioAssets);
    const next = attachCompositionContext(continuous, snapshot.units, decision);
    setSnapshot((current) => ({ ...current, composition: next, completedSteps: current.completedSteps.includes("world") ? current.completedSteps : [...current.completedSteps, "world"] }));
    return next;
  }, [cards, snapshot.audioAssets, snapshot.composition, snapshot.units]);

  const playComposition = useCallback(async (options?: { includePolish?: boolean; excludeGeneratedSupport?: boolean }) => {
    const storedComposition = snapshot.composition ?? attachCompositionContext(
      arrangeCompositionV2(cards, snapshot.units, 1),
      snapshot.units,
      "run-deterministic-arranger",
    );
    if (!snapshot.composition) setSnapshot((current) => ({ ...current, composition: storedComposition }));
    const withoutPolish = options?.includePolish === false
      ? { ...storedComposition, polishLayer: null, polishEnabled: false }
      : storedComposition;
    const composition = options?.excludeGeneratedSupport
      ? { ...withoutPolish, events: withoutPolish.events.filter((event) => !event.generatedBy) }
      : withoutPolish;
    const planKey = `${composition.id}:${composition.revision}:${composition.polishLayer?.id ?? "none"}:${options?.includePolish === false ? "base-only" : "full"}:${options?.excludeGeneratedSupport ? "visible-events" : "all-events"}`;
    if (loadedPlanRef.current === planKey && playback.status === "playing") {
      player.pause();
      return;
    }
    try {
      await player.unlock();
      if (loadedPlanRef.current !== planKey || playback.status === "error") {
        await player.load({ composition, assets: playbackAssets });
        loadedPlanRef.current = planKey;
      }
      player.play();
      complete("compose");
    } catch {
      loadedPlanRef.current = null;
    }
  }, [cards, complete, playback.status, playbackAssets, player, snapshot.composition, snapshot.units]);

  const playArchivedComposition = useCallback(async (id: string) => {
    const composition = snapshot.archivedCompositions.find((item) => item.id === id);
    if (!composition) return;
    const planKey = `${composition.id}:${composition.revision}:${composition.polishLayer?.id ?? "none"}:archive`;
    if (loadedPlanRef.current === planKey && playback.status === "playing") {
      player.pause();
      return;
    }
    try {
      await player.unlock();
      if (loadedPlanRef.current !== planKey || playback.status === "error") {
        await player.load({ composition, assets: playbackAssets });
        loadedPlanRef.current = planKey;
      }
      player.play();
    } catch {
      loadedPlanRef.current = null;
    }
  }, [playback.status, playbackAssets, player, snapshot.archivedCompositions]);

  const seekPlayback = useCallback(async (seconds: number) => {
    const composition = snapshot.composition ?? attachCompositionContext(
      arrangeCompositionV2(cards, snapshot.units, 1),
      snapshot.units,
      "run-deterministic-arranger",
    );
    if (!snapshot.composition) setSnapshot((current) => ({ ...current, composition }));
    const planKey = `${composition.id}:${composition.revision}:${composition.polishLayer?.id ?? "none"}:full:all-events`;
    try {
      await player.unlock();
      if (loadedPlanRef.current !== planKey || playback.status === "error") {
        await player.load({ composition, assets: playbackAssets });
        loadedPlanRef.current = planKey;
      }
      player.seek(seconds);
    } catch {
      loadedPlanRef.current = null;
    }
  }, [cards, playback.status, playbackAssets, player, snapshot.composition, snapshot.units]);

  const pausePlayback = useCallback(() => player.pause(), [player]);

  const requestCompositionAdvice = useCallback(async () => {
    const current = snapshotRef.current;
    const composition = current.composition;
    if (!composition) return;
    if (composition.teachingAdvice?.compositionRevision === composition.revision) {
      setCompositionAdviceStatus(composition.teachingAdvice.sourceKind === "live_ai" ? "ready" : "fallback");
      return;
    }
    setCompositionAdviceStatus("requesting");
    let advice;
    let status: CompositionAdviceStatus = "ready";
    try {
      advice = await compositionAdvisor.advise(composition, current.cards, current.units);
    } catch {
      advice = compositionAdvisor.fallback(composition, current.cards, current.units);
      status = "fallback";
    }
    // 等待期间作品可能又被改动（例如刚生成完背景）。判断依据是匿名摘要本身有没有变：
    // 摘要没变就沿用这份解释并盖上新版本号；摘要真的变了才退回 idle，由下一轮重新解释。
    const latest = snapshotRef.current;
    const latestComposition = latest.composition;
    if (!latestComposition) return;
    if (latestComposition.revision !== composition.revision && !describesSameComposition(advice, latestComposition, latest.cards, latest.units)) {
      setCompositionAdviceStatus("idle");
      return;
    }
    setSnapshot((current) => current.composition ? {
      ...current,
      composition: { ...current.composition, teachingAdvice: { ...advice, compositionRevision: current.composition.revision } },
    } : current);
    setCompositionAdviceStatus(status);
  }, [compositionAdvisor]);

  const togglePolish = useCallback((enabled: boolean) => {
    setSnapshot((current) => current.composition ? { ...current, composition: { ...current.composition, polishEnabled: enabled } } : current);
    player.setPolishEnabled(enabled);
  }, [player]);

  const generatePolish = useCallback(async (useFallback = false) => {
    const current = snapshotRef.current;
    const composition = current.composition ?? attachCompositionContext(
      arrangeCompositionV2(current.cards, current.units, 1),
      current.units,
      "run-deterministic-arranger",
    );
    setPolishStatus("requesting");
    setPolishErrorMessage(null);
    let layer: AIPolishLayer;
    try {
      layer = useFallback
        ? await polish.fallback(composition, current.cards, current.units)
        : await polish.generate(composition, current.cards, current.units);
    } catch (error) {
      setPolishStatus("failed");
      setPolishErrorMessage(error instanceof Error ? error.message : "AI 背景生成失败，请稍后重试。");
      return false;
    }
    const updated = markCompositionDraft({ ...composition, polishLayer: layer, polishEnabled: true }, composition);
    const next = { ...current, composition: updated, completedSteps: current.completedSteps.includes("polish") ? current.completedSteps : [...current.completedSteps, "polish"] };
    snapshotRef.current = next;
    setSnapshot(next);
    setPolishStatus(layer.sourceKind === "local_fallback" ? "fallback" : "ready");
    try {
      await player.load({ composition: updated, assets: playbackAssets });
      loadedPlanRef.current = `${updated.id}:${updated.revision}:${updated.polishLayer?.id ?? "none"}`;
    } catch {
      loadedPlanRef.current = null;
      setPolishStatus("failed");
      setPolishErrorMessage(layer.sourceKind === "live_ai" ? "AI 音频已经生成，但浏览器暂时无法加载该临时音频。" : "智能音符背景暂时无法加载。");
      return false;
    }
    return true;
  }, [playbackAssets, player, polish]);

  const dismissPolishFailure = useCallback(() => {
    setPolishStatus("declined");
    setPolishErrorMessage(null);
  }, []);

  const toggleUnit = useCallback((id: string) => {
    setSnapshot((current) => {
      const units = current.units.map((unit) => unit.id === id ? { ...unit, active: !unit.active } : unit);
      const next = current.composition ? attachCompositionContext({
        ...arrangeCompositionV2(current.cards, units, current.composition.revision + 1, current.composition.durationSeconds, current.composition.seed),
        title: current.composition.title,
        createdAt: current.composition.createdAt,
        polishLayer: current.composition.polishLayer,
        polishEnabled: current.composition.polishEnabled,
        emotionIntent: current.composition.emotionIntent,
        seed: current.composition.seed,
      }, units, "run-deterministic-arranger") : null;
      return { ...current, units, composition: next };
    });
  }, []);

  const setActiveUnits = useCallback((ids: string[]) => {
    setSnapshot((current) => {
      if (ids.length === 0) {
        return { ...current, units: current.units.map((unit) => ({ ...unit, active: false })), composition: null };
      }
      const next = coordinateCompositionArrangement({ composition: invalidateAutomaticArrangementSupport(current.composition), cards: current.cards, units: current.units, requestedIds: ids });
      const normalized = normalizeEditableSourceClips(next.composition, current.audioAssets);
      return { ...current, units: next.units, composition: markCompositionDraft(normalized, current.composition) };
    });
  }, []);

  const updateWorldArrangement = useCallback((soundUnitId: string, patch: Partial<WorldArrangementValues>) => {
    setSnapshot((current) => {
      const base = invalidateAutomaticArrangementSupport(current.composition) ?? attachCompositionContext(
        arrangeCompositionV2(current.cards, current.units, 1),
        current.units,
        "run-deterministic-arranger",
      );
      const updated = updateWorldComposition(base, current.cards, current.units, soundUnitId, patch);
      return { ...current, composition: markCompositionDraft(attachCompositionContext(updated, current.units, "preserve-child-arrangement"), current.composition) };
    });
  }, []);

  const moveWorldEvent = useCallback((eventId: string, patch: { startBeat?: number; pitch?: PitchChoice }) => {
    setSnapshot((current) => current.composition ? { ...current, composition: markCompositionDraft(attachCompositionContext(moveWorldCompositionEvent(invalidateAutomaticArrangementSupport(current.composition)!, eventId, patch), current.units, "preserve-child-arrangement"), current.composition) } : current);
  }, []);

  const duplicateWorldEvent = useCallback((eventId: string) => {
    setSnapshot((current) => current.composition ? { ...current, composition: markCompositionDraft(attachCompositionContext(duplicateWorldCompositionEvent(invalidateAutomaticArrangementSupport(current.composition)!, eventId), current.units, "preserve-child-arrangement"), current.composition) } : current);
  }, []);

  const deleteWorldEvent = useCallback((eventId: string) => {
    setSnapshot((current) => {
      if (!current.composition) return current;
      const deleted = deleteWorldCompositionEvent(invalidateAutomaticArrangementSupport(current.composition)!, eventId);
      const next = markCompositionDraft(attachCompositionContext(deleted, current.units, "preserve-child-arrangement"), current.composition);
      if (next.events.length === 0) return { ...current, composition: null, units: current.units.map((unit) => ({ ...unit, active: false })) };
      const selected = new Set(next.soundUnitIds);
      return { ...current, composition: next, units: current.units.map((unit) => ({ ...unit, active: selected.has(unit.id) })) };
    });
  }, []);

  const updateWorldEventClip = useCallback((eventId: string, selection: { startSeconds: number; endSeconds: number }, options?: { expandWorkToFit?: boolean }) => {
    setSnapshot((current) => {
      const invalidated = invalidateAutomaticArrangementSupport(current.composition);
      const event = invalidated?.events.find((item) => item.id === eventId);
      const asset = event ? current.audioAssets.find((item) => item.id === event.audioAssetId) : null;
      if (!invalidated || !event || !asset) return current;
      // 放置空间不足时不静默截断：先按需要把作品换成更长的档位，再套用完整选区。
      const requiredSeconds = Math.max(0, selection.endSeconds - selection.startSeconds);
      const expanded = options?.expandWorkToFit ? smallestDurationOptionFor(requiredSeconds) : null;
      const base = expanded && expanded > invalidated.durationSeconds
        ? { ...resizeCompositionDuration(invalidated, expanded), durationOrigin: "user" as const }
        : invalidated;
      const updated = updateCompositionEventSourceClip(base, eventId, asset, selection);
      return {
        ...current,
        composition: markCompositionDraft(attachCompositionContext(updated, current.units, "preserve-child-arrangement"), current.composition),
      };
    });
  }, []);

  const cyclePattern = useCallback((cardId: string) => {
    const order: PatternChoice[] = ["once", "repeat", "bursts", "fade-in"];
    setSnapshot((current) => {
      const cards = current.cards.map((card) => card.id === cardId ? { ...card, pattern: order[(order.indexOf(card.pattern) + 1) % order.length] } : card);
      const units = current.units.map((unit) => unit.cardId === cardId ? { ...unit, parameters: { ...unit.parameters, pattern: order[(order.indexOf(unit.parameters.pattern) + 1) % order.length] } } : unit);
      const composition = current.composition ? attachCompositionContext({
        ...arrangeCompositionV2(cards, units, current.composition.revision + 1, current.composition.durationSeconds, current.composition.seed),
        title: current.composition.title,
        createdAt: current.composition.createdAt,
        polishLayer: current.composition.polishLayer,
        polishEnabled: current.composition.polishEnabled,
        emotionIntent: current.composition.emotionIntent,
        seed: current.composition.seed,
      }, units, "run-deterministic-arranger") : null;
      return { ...current, cards, units, composition };
    });
  }, []);

  const setCompositionEmotion = useCallback((label: EmotionIntent["label"]) => {
    const coordinates: Record<Exclude<EmotionIntent["label"], null>, [number, number]> = {
      bright: [0.72, 0.78],
      content: [0.62, -0.68],
      tense: [-0.68, 0.8],
      blue: [-0.65, -0.7],
    };
    const current = snapshotRef.current;
    const base = current.composition ?? attachCompositionContext(
      arrangeCompositionV2(current.cards, current.units, 1),
      current.units,
      "run-deterministic-arranger",
    );
    const [valence, arousal] = label ? coordinates[label] : [0, 0];
    const next = {
      ...current,
      composition: {
        ...base,
        revision: current.composition ? current.composition.revision + 1 : base.revision,
        savedAt: undefined,
        emotionIntent: { enabled: label !== null, valence, arousal, label, mappingVersion: "emotion-mapping-v1" as const },
      },
    };
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const setCompositionEmotionPoint = useCallback((input: { valence: number; arousal: number; label: Exclude<EmotionIntent["label"], null> }) => {
    const current = snapshotRef.current;
    const base = current.composition ?? attachCompositionContext(
      arrangeCompositionV2(current.cards, current.units, 1),
      current.units,
      "run-deterministic-arranger",
    );
    const next = {
      ...current,
      composition: {
        ...base,
        revision: current.composition ? current.composition.revision + 1 : base.revision,
        savedAt: undefined,
        emotionIntent: { enabled: true, valence: input.valence, arousal: input.arousal, label: input.label, mappingVersion: "emotion-mapping-v1" as const },
      },
    };
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const setCompositionDuration = useCallback((seconds: CompositionDurationSeconds) => {
    player.stop();
    loadedPlanRef.current = null;
    // 儿童手动选择的声音片段是作品时长的下限，切换档位不能把它剪短。
    setSnapshot((current) => current.composition && durationOptionFitsUserClips(current.composition, seconds) ? {
      ...current,
      composition: markCompositionDraft(
        ensureNaturalSoundContinuity(
          attachCompositionContext({ ...resizeCompositionDuration(invalidateNaturalSoundContinuity(current.composition)!, seconds), durationOrigin: "user" as const }, current.units, "preserve-child-arrangement"),
          current.units,
          current.audioAssets,
        ),
        current.composition,
      ),
    } : current);
  }, [player]);

  const saveWork = useCallback(async () => {
    const current = snapshotRef.current;
    if (!current.composition) return null;
    const savedAt = new Date().toISOString();
    const idAlreadyArchived = current.archivedCompositions.some((item) => item.id === current.composition?.id);
    const archivedComposition: Composition = {
      ...current.composition,
      id: idAlreadyArchived ? `work-${crypto.randomUUID()}` : current.composition.id,
      title: current.composition.title ?? current.project.name,
      createdAt: current.composition.createdAt ?? savedAt,
      savedAt,
    };
    const next: DemoSnapshot = {
      ...current,
      currentPath: `/works/${archivedComposition.id}`,
      composition: archivedComposition,
      archivedCompositions: [...current.archivedCompositions, archivedComposition],
      completedSteps: current.completedSteps.includes("save") ? current.completedSteps : [...current.completedSteps, "save"],
    };
    snapshotRef.current = next;
    setSnapshot(next);
    await repository.save(next);
    return archivedComposition.id;
  }, [repository]);

  const resetDemo = useCallback(async () => {
    player.stop();
    loadedPlanRef.current = null;
    await Promise.all([repository.clear(), captureRepository.clearAll().catch(() => undefined)]);
    setSnapshot(createInitialDemoSnapshot());
    setPendingCardImage(null);
    setSavedContributorNames([]);
    setRecordings([]);
    setLibraryItemPreferences([]);
    setPolishStatus("idle");
    setCompositionAdviceStatus("idle");
    setPolishErrorMessage(null);
  }, [captureRepository, player, repository]);

  const value = useMemo<ExperienceContextValue>(() => ({
    projectName: snapshot.project.name,
    cards,
    paperCards: snapshot.paperCards,
    audioAssets: snapshot.audioAssets,
    audioPlaybackUrls,
    units: snapshot.units,
    composition: snapshot.composition,
    archivedCompositions: snapshot.archivedCompositions,
    currentCard,
    playback,
    polishStatus,
    compositionAdviceStatus,
    polishErrorMessage,
    persistenceStatus,
    hydrated,
    resumePath: snapshot.currentPath,
    completedSteps: snapshot.completedSteps,
    pendingCardImage,
    contributorNames,
    recordings,
    libraryItemPreferences,
    startDemo,
    savePendingCardImage,
    registerContributorName,
    saveRecording,
    createPaperSoundDrafts,
    bindCardToLibrarySource,
    renameLibraryItem,
    deleteLibraryItem,
    selectRecording,
    selectCard,
    updateCurrentCard,
    confirmCurrentCard,
    toggleUnit,
    setActiveUnits,
    updateWorldArrangement,
    moveWorldEvent,
    duplicateWorldEvent,
    deleteWorldEvent,
    updateWorldEventClip,
    playCard,
    prepareComposition,
    playComposition,
    playArchivedComposition,
    seekPlayback,
    pausePlayback,
    togglePolish,
    generatePolish,
    requestCompositionAdvice,
    dismissPolishFailure,
    cyclePattern,
    setCompositionEmotion,
    setCompositionEmotionPoint,
    setCompositionDuration,
    saveWork,
    resetDemo,
  }), [audioPlaybackUrls, bindCardToLibrarySource, cards, compositionAdviceStatus, confirmCurrentCard, contributorNames, createPaperSoundDrafts, currentCard, cyclePattern, deleteLibraryItem, deleteWorldEvent, dismissPolishFailure, duplicateWorldEvent, generatePolish, hydrated, libraryItemPreferences, moveWorldEvent, pausePlayback, pendingCardImage, persistenceStatus, playArchivedComposition, playCard, playComposition, playback, polishErrorMessage, polishStatus, prepareComposition, recordings, registerContributorName, renameLibraryItem, requestCompositionAdvice, resetDemo, savePendingCardImage, saveRecording, saveWork, seekPlayback, selectCard, selectRecording, setActiveUnits, setCompositionDuration, setCompositionEmotion, setCompositionEmotionPoint, snapshot.archivedCompositions, snapshot.audioAssets, snapshot.completedSteps, snapshot.composition, snapshot.currentPath, snapshot.paperCards, snapshot.project.name, snapshot.units, startDemo, togglePolish, toggleUnit, updateCurrentCard, updateWorldArrangement, updateWorldEventClip]);

  return (
    <ExperienceContext.Provider value={value}>
      <PageTransitionIndicator />
      {persistenceStatus === "recovered" && <div className="storage-notice" role="status">检测到旧版或损坏的本地数据，已安全恢复为演示项目。</div>}
      {persistenceStatus === "memory-fallback" && <div className="storage-notice storage-notice--warning" role="status">本地存储暂不可用；当前会话仍可体验，但刷新后可能无法恢复。</div>}
      {persistenceStatus === "error" && <div className="storage-notice storage-notice--warning" role="status">本地状态初始化失败；已保留演示界面，请刷新后重试。</div>}
      {children}
    </ExperienceContext.Provider>
  );
}

export function useExperience(): ExperienceContextValue {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience must be used inside CompositionRoot");
  return value;
}

function repositoryStatusToUi(status: ReturnType<DemoRepository["getStatus"]>): PersistenceStatus {
  if (status === "recovered") return "recovered";
  if (status === "memory-fallback") return "memory-fallback";
  return "ready";
}

function markCompositionDraft(composition: Composition, previous?: Composition | null): Composition {
  return {
    ...composition,
    title: previous?.title ?? composition.title,
    createdAt: previous?.createdAt ?? composition.createdAt,
    savedAt: undefined,
  };
}

/** 解释是否仍然对得上当前作品：比较匿名摘要的哈希，而不是版本号。 */
function describesSameComposition(
  advice: CompositionTeachingAdvice,
  composition: Composition,
  cards: ConfirmedSoundCard[],
  units: SoundUnit[],
): boolean {
  try {
    return stableAdviceHash(JSON.stringify(buildCompositionAdviceBrief(composition, cards, units))) === advice.basedOnInputHash;
  } catch {
    return false;
  }
}

function invalidateNaturalSoundContinuity(composition: Composition | null): Composition | null {
  if (!composition) return null;
  return {
    ...composition,
    events: composition.events.filter((event) => event.generatedBy !== "natural-sound-continuity-v1"),
    naturalSoundContinuity: undefined,
  };
}

function invalidateAutomaticArrangementSupport(composition: Composition | null): Composition | null {
  if (!composition) return null;
  return {
    ...composition,
    events: composition.events.filter((event) => !event.generatedBy),
    naturalSoundContinuity: undefined,
  };
}

function createRecordingAudioAsset(recording: StoredRecording, projectId: string): OriginalAudioAsset {
  return {
    id: `audio-${recording.id}`,
    projectId,
    kind: "local_recording",
    sourceKey: recording.id,
    label: recording.name,
    storageRef: `indexeddb://${recording.id}`,
    mimeType: recording.mimeType,
    durationMs: Math.max(1, recording.durationMs),
    byteLength: Math.max(1, recording.blob.size),
    sha256: "0".repeat(64),
    licenseRef: "local-user-recording",
    createdAt: recording.createdAt,
  };
}
