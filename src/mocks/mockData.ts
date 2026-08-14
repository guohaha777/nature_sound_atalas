import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { SoundProject } from "@/src/domain/project";
import type { ConfirmedSoundCard, PaperSoundCard, SoundUnit } from "@/src/domain/sound-card";

export const DEMO_PROJECT_ID = "demo-project";
export const DEMO_CREATED_AT = "2026-08-03T09:00:00.000Z";

export const MOCK_PROJECT: SoundProject = {
  id: DEMO_PROJECT_ID,
  name: "三年二班 · 八月的声音",
  mode: "demo",
  demoManifestVersion: "demo-world-v1",
  activeCompositionId: null,
  createdAt: DEMO_CREATED_AT,
  updatedAt: DEMO_CREATED_AT,
};

export const MOCK_ORIGINAL_AUDIO_ASSETS: OriginalAudioAsset[] = [
  { id: "audio-cow", projectId: DEMO_PROJECT_ID, kind: "licensed_system", sourceKey: "cow", label: "牛", storageRef: "/demo/audio/cow.mp3", mimeType: "audio/mpeg", durationMs: 1254, byteLength: 30143, sha256: "77565a6a210c487846c43068cd90f70e9b9625e85efe5d3a638ab48a3bcfaac0", licenseRef: "user-provided-demo-audio:public-use-confirmed-2026-08-10", createdAt: DEMO_CREATED_AT },
  { id: "audio-wind", projectId: DEMO_PROJECT_ID, kind: "licensed_system", sourceKey: "wind", label: "风", storageRef: "/demo/audio/wind.mp3", mimeType: "audio/mpeg", durationMs: 18991, byteLength: 455834, sha256: "b75ba153778a0b9ce4c68b3feab43da37eb26a5c9433389fd8c5ce3d4af6a0ad", licenseRef: "user-provided-demo-audio:public-use-confirmed-2026-08-10", createdAt: DEMO_CREATED_AT },
  { id: "audio-forest-bird", projectId: DEMO_PROJECT_ID, kind: "licensed_system", sourceKey: "springbird", label: "树林里的鸟叫", storageRef: "/demo/audio/forest-bird.mp3", mimeType: "audio/mpeg", durationMs: 59455, byteLength: 1426962, sha256: "f72f194cc0317032386f75190412ec2ea23484a1b9cd120e97de66596c3f8e85", licenseRef: "user-provided-demo-audio:public-use-confirmed-2026-08-10", createdAt: DEMO_CREATED_AT },
  { id: "audio-falling-apple", projectId: DEMO_PROJECT_ID, kind: "licensed_system", sourceKey: "falling-apple", label: "苹果落地", storageRef: "/demo/audio/falling-apple.mp3", mimeType: "audio/mpeg", durationMs: 3657, byteLength: 87821, sha256: "c48330fa9482fe2618456df7af0019d75adaeb90c3dc7b513cbc3f3654fb9389", licenseRef: "user-provided-demo-audio:public-use-confirmed-2026-08-10", createdAt: DEMO_CREATED_AT },
  { id: "audio-bicycle", projectId: DEMO_PROJECT_ID, kind: "licensed_system", sourceKey: "bicycle", label: "自行车", storageRef: "/demo/audio/bicycle.mp3", mimeType: "audio/mpeg", durationMs: 5669, byteLength: 136095, sha256: "803c4157eb7709566df8ac1116115ebf5f9dc2210ba5f41b54a42031aa3508f8", licenseRef: "user-provided-demo-audio:public-use-confirmed-2026-08-10", createdAt: DEMO_CREATED_AT },
];

export type CreatureKind = "rain" | "cow" | "bell" | "steps";

export interface MockSoundCard extends ConfirmedSoundCard {
  owner: string;
  ownerInitials: string;
  place: string;
  recordedAt: string;
  creatureKind: CreatureKind;
  color: string;
  accent: string;
  candidates: string[];
  childNote: string;
  attribution: string;
  audioRecipe: {
    instrument: "noise" | "low-synth" | "metal" | "drum";
    baseNote: string;
  };
}

// 所有占位数据只存在于本文件。接入正式素材时替换或删除本文件即可。
export const MOCK_SOUND_CARDS: MockSoundCard[] = [
  {
    id: "rain",
    projectId: DEMO_PROJECT_ID,
    paperCardId: "paper-card-xiaoyu",
    entryIndex: 0,
    owner: "系统",
    ownerInitials: "SYS",
    place: "系统声音库",
    recordedAt: "2026.08.03",
    source: { label: "树梢间的风", normalizedKey: "wind", decisionSource: "demo" },
    pitch: "high",
    duration: "long",
    contour: "wavy",
    intensity: "soft",
    pattern: "fade-in",
    templateVersion: "sound-card-v1",
    confirmedAt: "mock-demo",
    creatureKind: "rain",
    color: "#8fa8aa",
    accent: "#566f73",
    candidates: ["风", "树叶沙沙", "远处的水声"],
    childNote: "风从树梢穿过去，树叶一起轻轻晃。",
    attribution: "系统内置授权原声",
    audioRecipe: { instrument: "noise", baseNote: "A5" },
  },
  {
    id: "cow",
    projectId: DEMO_PROJECT_ID,
    paperCardId: "paper-card-xiaoyu",
    entryIndex: 1,
    owner: "系统",
    ownerInitials: "SYS",
    place: "系统声音库",
    recordedAt: "2026.08.04",
    source: { label: "远处的牛", normalizedKey: "cow", decisionSource: "demo" },
    pitch: "low",
    duration: "long",
    contour: "falling",
    intensity: "medium",
    pattern: "once",
    templateVersion: "sound-card-v1",
    confirmedAt: "mock-demo",
    creatureKind: "cow",
    color: "#d6b14d",
    accent: "#715d3d",
    candidates: ["牛", "羊", "远处的动物"],
    childNote: "它在山那边叫，声音慢慢落下去。",
    attribution: "系统内置授权原声",
    audioRecipe: { instrument: "low-synth", baseNote: "C2" },
  },
  {
    id: "bell",
    projectId: DEMO_PROJECT_ID,
    paperCardId: "paper-card-xiaoyu",
    entryIndex: 2,
    owner: "系统",
    ownerInitials: "SYS",
    place: "系统声音库",
    recordedAt: "2026.08.05",
    source: { label: "路过的自行车", normalizedKey: "bicycle", decisionSource: "demo" },
    pitch: "high",
    duration: "short",
    contour: "flat",
    intensity: "medium",
    pattern: "repeat",
    templateVersion: "sound-card-v1",
    confirmedAt: "mock-demo",
    creatureKind: "bell",
    color: "#d8a46f",
    accent: "#7b5841",
    candidates: ["自行车", "自行车铃", "车轮转动"],
    childNote: "车轮从身边过去，铃声一下就跑远了。",
    attribution: "系统内置授权原声",
    audioRecipe: { instrument: "metal", baseNote: "E5" },
  },
  {
    id: "steps",
    projectId: DEMO_PROJECT_ID,
    paperCardId: "paper-card-aming",
    entryIndex: 0,
    owner: "系统",
    ownerInitials: "SYS",
    place: "系统声音库",
    recordedAt: "2026.08.06",
    source: { label: "苹果落在地上", normalizedKey: "falling-apple", decisionSource: "demo" },
    pitch: "mid",
    duration: "short",
    contour: "rising",
    intensity: "loud",
    pattern: "bursts",
    templateVersion: "sound-card-v1",
    confirmedAt: "mock-demo",
    creatureKind: "steps",
    color: "#cb9184",
    accent: "#765548",
    candidates: ["苹果落地", "果实碰到木板", "轻轻敲一下"],
    childNote: "苹果咚地掉下来，叶子又响了一小会儿。",
    attribution: "系统内置授权原声",
    audioRecipe: { instrument: "drum", baseNote: "C3" },
  },
  {
    id: "springbird",
    projectId: DEMO_PROJECT_ID,
    paperCardId: "paper-card-system",
    entryIndex: 0,
    owner: "系统",
    ownerInitials: "SYS",
    place: "系统声音库",
    recordedAt: "2026.08.03",
    source: { label: "树林里的鸟叫", normalizedKey: "springbird", decisionSource: "demo" },
    pitch: "high",
    duration: "long",
    contour: "wavy",
    intensity: "soft",
    pattern: "once",
    templateVersion: "sound-card-v1",
    confirmedAt: "mock-demo",
    creatureKind: "rain",
    color: "#9fb690",
    accent: "#50644b",
    candidates: ["树林里的鸟叫", "Springbird", "春日鸟鸣"],
    childNote: "系统声音库中的树林鸟叫原声，可直接试听和加入声场。",
    attribution: "系统内置授权原声",
    audioRecipe: { instrument: "noise", baseNote: "B5" },
  },
];

export const MOCK_PAPER_SOUND_CARDS: PaperSoundCard[] = [
  { id: "paper-card-xiaoyu", projectId: DEMO_PROJECT_ID, contributorId: "child-xiaoyu", entryIds: ["rain", "cow", "bell"], maxEntries: 3, imageAssetId: null, templateVersion: "paper-sound-card-v1", createdAt: DEMO_CREATED_AT },
  { id: "paper-card-aming", projectId: DEMO_PROJECT_ID, contributorId: "child-aming", entryIds: ["steps"], maxEntries: 3, imageAssetId: null, templateVersion: "paper-sound-card-v1", createdAt: DEMO_CREATED_AT },
];

const AUDIO_ASSET_BY_SOURCE: Record<string, string> = {
  wind: "audio-wind",
  cow: "audio-cow",
  bicycle: "audio-bicycle",
  "falling-apple": "audio-falling-apple",
  springbird: "audio-forest-bird",
};

export const MOCK_SOUND_UNITS: SoundUnit[] = MOCK_SOUND_CARDS.map((card, index) => ({
  id: `sound-${card.id}`,
  projectId: DEMO_PROJECT_ID,
  cardId: card.id,
  originalAudioAssetId: AUDIO_ASSET_BY_SOURCE[card.source.normalizedKey],
  inputMode: "demo",
  parameters: { pitch: card.pitch, duration: card.duration, contour: card.contour, intensity: card.intensity, pattern: card.pattern },
  provenance: {
    contributorId: "system-library",
    contributorName: card.owner,
    originalCardAssetId: null,
    originalAudioAssetId: AUDIO_ASSET_BY_SOURCE[card.source.normalizedKey],
    recordedAt: card.recordedAt,
    place: card.place,
    archiveScopes: ["personal", "classroom"],
  },
  contributionLabel: card.owner === "系统" ? "系统声音" : `${card.owner}的声音`,
  active: index < 3,
  mappingVersion: "music-mapping-v1",
  createdAt: DEMO_CREATED_AT,
}));

export const MOCK_POLISH_RESULT = {
  provider: "mock-adapter",
  model: "prepared-demo-v1",
  promptVersion: "polish-v1" as const,
  sourceKind: "cached_demo_ai" as const,
  message: "已加载预置缓存背景；当前 Mock 尚不随字段改变",
};

export const MOCK_LOCAL_FALLBACK = {
  provider: "local-rule-pad",
  model: null,
  promptVersion: null,
  sourceKind: "local_fallback" as const,
  message: "模拟 AI 未完成，已使用本地规则背景",
};

export const FIELD_OPTIONS = {
  pitch: [
    { value: "high", label: "高" },
    { value: "mid", label: "中" },
    { value: "low", label: "低" },
  ],
  duration: [
    { value: "short", label: "短短的" },
    { value: "medium", label: "刚刚好" },
    { value: "long", label: "长长的" },
  ],
  contour: [
    { value: "rising", label: "往上走" },
    { value: "falling", label: "往下落" },
    { value: "flat", label: "稳稳的" },
    { value: "wavy", label: "有起伏" },
  ],
  intensity: [
    { value: "soft", label: "轻轻的" },
    { value: "medium", label: "刚刚好" },
    { value: "loud", label: "响亮的" },
  ],
  pattern: [
    { value: "once", label: "出现一次" },
    { value: "repeat", label: "重复出现" },
    { value: "bursts", label: "一阵一阵" },
    { value: "fade-in", label: "慢慢出现" },
  ],
} as const;
