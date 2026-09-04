import type { ConfirmedSoundCard, SoundUnit } from "../sound-card";
import { mapCardToMusicIntent } from "../music-mapping";
import { DEFAULT_COMPOSITION_DURATION_SECONDS } from "./durationOptions";
import type { Composition, CompositionEvent } from "./types";

type ArrangementRole = NonNullable<CompositionEvent["arrangementRole"]>;
type ArrangementSection = NonNullable<CompositionEvent["section"]>;

const SECTION_RANGES: Record<ArrangementSection, readonly [number, number]> = {
  opening: [0.02, 0.18],
  development: [0.23, 0.47],
  peak: [0.52, 0.74],
  ending: [0.79, 0.94],
};

const ROLE_SECTION_POSITIONS: Record<ArrangementRole, Record<ArrangementSection, number>> = {
  "lead-natural": { opening: 0.06, development: 0.34, peak: 0.59, ending: 0.86 },
  "rhythmic-anchor": { opening: 0.1, development: 0.29, peak: 0.55, ending: 0.82 },
  texture: { opening: 0.02, development: 0.24, peak: 0.52, ending: 0.8 },
  response: { opening: 0.15, development: 0.42, peak: 0.69, ending: 0.9 },
  accent: { opening: 0.12, development: 0.38, peak: 0.63, ending: 0.92 },
};

/**
 * 决赛确定性编曲 V2：同一输入与种子完全可复现，并为每个声音建立四段式角色轨迹。
 * 本函数只用于没有可保留手动编排时；已有儿童事件由上层协调器原样保留。
 */
export function arrangeCompositionV2(
  cards: ConfirmedSoundCard[],
  units: SoundUnit[],
  revision = 1,
  durationSeconds: number = DEFAULT_COMPOSITION_DURATION_SECONDS,
  seed = "wanwu-arrangement-v2",
): Composition {
  const bpm = chooseBpm(cards, units, seed);
  const activeUnits = units.filter((unit) => unit.active);
  const events: CompositionEvent[] = [];
  const occupancy = new Map<string, number[]>();
  const roles = resolveRoles(cards, activeUnits);

  activeUnits.forEach((unit, unitIndex) => {
    const card = cards.find((item) => item.id === unit.cardId);
    if (!card) return;
    const confirmed = { ...card, ...unit.parameters };
    const intent = mapCardToMusicIntent(confirmed);
    const role = roles.get(unit.id);
    if (!role) return;
    const clipDurationSeconds = clipDurationFor(confirmed.duration, role, durationSeconds);

    (Object.keys(SECTION_RANGES) as ArrangementSection[]).forEach((section, sectionIndex) => {
      const baseRatio = ROLE_SECTION_POSITIONS[role][section];
      const jitter = seededRange(`${seed}:${unit.id}:${section}:${confirmed.pitch}:${confirmed.pattern}`, -0.018, 0.018);
      const [minimumRatio, maximumRatio] = SECTION_RANGES[section];
      const desiredRatio = clamp(baseRatio + jitter + unitIndex * 0.009, minimumRatio, maximumRatio);
      const desiredSeconds = desiredRatio * durationSeconds;
      const pitchBand = confirmed.pitch;
      const startSeconds = findOpenStart(desiredSeconds, clipDurationSeconds, durationSeconds, pitchBand, occupancy);
      rememberStart(occupancy, pitchBand, startSeconds);
      const sectionGain = section === "peak" ? 1.1 : section === "ending" ? -1.2 : section === "opening" ? -0.6 : 0;
      const roleGain = role === "lead-natural" ? 0.8 : role === "texture" ? -1.5 : role === "accent" ? 0.5 : 0;
      const echoAttenuation = confirmed.pattern === "once" && sectionIndex > 0 ? -2.2 : 0;

      events.push({
        id: `${unit.id}-v2-${section}`,
        soundUnitId: unit.id,
        audioAssetId: unit.originalAudioAssetId,
        sourceKey: intent.sourceKey,
        startBeat: secondsToBeats(startSeconds, bpm),
        durationBeats: secondsToBeats(clipDurationSeconds, bpm),
        gainDb: Number((intent.gainDb + sectionGain + roleGain + echoAttenuation).toFixed(2)),
        semitoneShift: intent.semitoneShift,
        filterMotion: intent.contour.filterMotion,
        contourSemitoneDelta: intent.contour.semitoneDelta,
        fadeInSeconds: confirmed.pattern === "fade-in" ? Math.min(1.2, clipDurationSeconds / 3) : 0.04,
        fadeOutSeconds: section === "ending" ? Math.min(1, clipDurationSeconds / 2) : Math.min(0.35, clipDurationSeconds / 4),
        loop: confirmed.pattern === "repeat" || confirmed.pattern === "bursts",
        clipDurationSeconds: section === "opening" ? undefined : clipDurationSeconds,
        generatedBy: section === "opening" ? undefined : "deterministic-arranger-v2",
        arrangementRole: role,
        section,
      });
    });
  });

  return {
    id: "demo-composition",
    projectId: activeUnits[0]?.projectId ?? "demo-project",
    soundUnitIds: activeUnits.map((unit) => unit.id),
    events: events.sort((a, b) => a.startBeat - b.startBeat),
    polishLayer: null,
    polishEnabled: false,
    bpm,
    durationSeconds,
    emotionIntent: {
      enabled: false,
      valence: 0,
      arousal: 0,
      label: null,
      mappingVersion: "emotion-mapping-v1",
    },
    seed,
    arrangerVersion: "arranger-v2",
    revision,
  };
}

const PITCH_RANK: Record<ConfirmedSoundCard["pitch"], number> = { high: 0, mid: 1, low: 2 };
const INTENSITY_RANK: Record<ConfirmedSoundCard["intensity"], number> = { loud: 0, medium: 1, soft: 2 };
const DURATION_RANK: Record<ConfirmedSoundCard["duration"], number> = { short: 0, medium: 1, long: 2 };

/**
 * assignRole 是「先命中先返回」的级联：长音会在轮到 lead-natural 之前就被判成 texture，
 * 所以它自己的两条领唱规则都可能永远够不到，整首曲子一个前景都没有——
 * 每个事件都吃 texture 的 −1.5dB 和 +0.8 秒，听起来又长又轻、没有主角。
 * 这里不改任何一条既有判断，只补一道兜底：没人当上领唱时，确定性地提一个上来。
 */
function resolveRoles(cards: ConfirmedSoundCard[], activeUnits: SoundUnit[]): Map<string, ArrangementRole> {
  const roles = new Map<string, ArrangementRole>();
  const confirmedByUnit = new Map<string, ConfirmedSoundCard>();
  activeUnits.forEach((unit, unitIndex) => {
    const card = cards.find((item) => item.id === unit.cardId);
    if (!card) return;
    const confirmed = { ...card, ...unit.parameters };
    confirmedByUnit.set(unit.id, confirmed);
    roles.set(unit.id, assignRole(confirmed, unitIndex, activeUnits.length));
  });
  if ([...roles.values()].includes("lead-natural")) return roles;
  const lead = pickLeadCandidate(activeUnits, confirmedByUnit, roles);
  if (lead) roles.set(lead, "lead-natural");
  return roles;
}

/**
 * 先从 texture 里挑——节奏支点和点缀已经在担事，铺底才是被过度分配的那一类。
 * 之后按「更响 → 更短 → 音更高 → 排得更靠前」：又轻又长的声音最不像主角。
 * 只看已确认字段，同样输入必得同样结果。
 */
function pickLeadCandidate(
  activeUnits: SoundUnit[],
  confirmedByUnit: Map<string, ConfirmedSoundCard>,
  roles: Map<string, ArrangementRole>,
): string | null {
  const ranked = activeUnits
    .map((unit, unitIndex) => ({ unit, unitIndex, confirmed: confirmedByUnit.get(unit.id) }))
    .filter((item): item is { unit: SoundUnit; unitIndex: number; confirmed: ConfirmedSoundCard } => Boolean(item.confirmed))
    .sort((a, b) =>
      (roles.get(a.unit.id) === "texture" ? 0 : 1) - (roles.get(b.unit.id) === "texture" ? 0 : 1)
      || INTENSITY_RANK[a.confirmed.intensity] - INTENSITY_RANK[b.confirmed.intensity]
      || DURATION_RANK[a.confirmed.duration] - DURATION_RANK[b.confirmed.duration]
      || PITCH_RANK[a.confirmed.pitch] - PITCH_RANK[b.confirmed.pitch]
      || a.unitIndex - b.unitIndex);
  return ranked[0]?.unit.id ?? null;
}

function assignRole(card: ConfirmedSoundCard, unitIndex: number, unitCount: number): ArrangementRole {
  if (card.duration === "long" && card.intensity === "soft") return "texture";
  if (card.pattern === "repeat" && (card.pitch === "low" || card.duration === "short")) return "rhythmic-anchor";
  if (card.pattern === "bursts" || (card.duration === "short" && card.intensity === "loud")) return "accent";
  if (card.pitch === "high" && card.contour !== "flat") return "lead-natural";
  if (card.duration === "long" || card.pattern === "fade-in") return "texture";
  if (unitCount === 1 || unitIndex === 0) return "lead-natural";
  return "response";
}

function clipDurationFor(duration: ConfirmedSoundCard["duration"], role: ArrangementRole, workSeconds: number) {
  const base = duration === "short" ? 0.9 : duration === "medium" ? 1.8 : 3.2;
  const roleAdjustment = role === "texture" ? 0.8 : role === "accent" ? -0.25 : 0;
  return Number(Math.min(Math.max(0.6, base + roleAdjustment), workSeconds * 0.2).toFixed(3));
}

function chooseBpm(cards: ConfirmedSoundCard[], units: SoundUnit[], seed: string) {
  const active = units.filter((unit) => unit.active);
  const activeCards = active.flatMap((unit) => {
    const card = cards.find((item) => item.id === unit.cardId);
    return card ? [{ ...card, ...unit.parameters }] : [];
  });
  const energetic = activeCards.filter((card) => card.intensity === "loud" || card.pattern === "repeat" || card.pattern === "bursts").length;
  const calm = activeCards.filter((card) => card.intensity === "soft" || card.duration === "long" || card.pattern === "fade-in").length;
  const base = 84 + energetic * 3 - calm * 2;
  const seedOffset = Math.round(seededRange(`${seed}:bpm`, -2, 2));
  return Math.max(72, Math.min(104, base + seedOffset));
}

function findOpenStart(
  desiredSeconds: number,
  clipDurationSeconds: number,
  workSeconds: number,
  pitchBand: string,
  occupancy: Map<string, number[]>,
) {
  const latestStart = Math.max(0, workSeconds - clipDurationSeconds);
  let candidate = clamp(desiredSeconds, 0, latestStart);
  const existing = occupancy.get(pitchBand) ?? [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (existing.every((start) => Math.abs(start - candidate) >= 0.32)) return candidate;
    candidate = clamp(candidate + (attempt % 2 === 0 ? 0.38 : -0.57), 0, latestStart);
  }
  return candidate;
}

function rememberStart(occupancy: Map<string, number[]>, pitchBand: string, startSeconds: number) {
  occupancy.set(pitchBand, [...occupancy.get(pitchBand) ?? [], startSeconds]);
}

function seededRange(key: string, minimum: number, maximum: number) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  const ratio = (hash >>> 0) / 0xffffffff;
  return minimum + (maximum - minimum) * ratio;
}

function secondsToBeats(seconds: number, bpm: number) {
  return Number((seconds * bpm / 60).toFixed(4));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
