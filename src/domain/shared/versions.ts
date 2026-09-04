/** 公共契约版本集中登记；行为或持久结构改变时只允许显式升级。 */
export const PUBLIC_BASE_VERSIONS = Object.freeze({
  databaseSchema: 2,
  demoManifest: "demo-world-v1",
  paperSoundCard: "paper-sound-card-v1",
  soundCard: "sound-card-v1",
  musicMapping: "music-mapping-v1",
  emotionMapping: "emotion-mapping-v1",
  arranger: "arranger-v2",
  polishPrompt: "polish-v1",
} as const);

export type PublicBaseVersions = typeof PUBLIC_BASE_VERSIONS;
