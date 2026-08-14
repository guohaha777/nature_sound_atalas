export type HomeEntranceId = "diary" | "record";
export type HomeEntranceIcon = "camera" | "mic";
export type ForestSoundPosition = "cloud" | "forest" | "apple";
export type DiaryEntrySource = "camera" | "upload";
export type RecordEntrySource = "record" | "library";
export type HomeEntrySource = DiaryEntrySource | RecordEntrySource;

export interface HomeEntranceMock {
  id: HomeEntranceId;
  index: string;
  title: string;
  englishTitle: string;
  description: string;
  icon: HomeEntranceIcon;
}

export interface ForestSoundMock {
  id: string;
  label: string;
  accessibleLabel: string;
  position: ForestSoundPosition;
  audioSrc: string;
}

export interface HomeEntryOptionMock {
  id: HomeEntrySource;
  emoji: string;
  title: string;
  englishTitle: string;
  description: string;
}

// 首页仍处于视觉与交互演示阶段；入口和环境声音文案集中在此处，便于后续替换正式数据。
export const HOME_PAGE_MOCK = {
  headerMeta: "SOUND ATLAS · 2026",
  headerAside: "关于",
  entrances: [
    {
      id: "diary",
      index: "01",
      title: "读一张声音日记",
      englishTitle: "READ A SOUND DIARY",
      description: "拍下纸上的声音，让它第一次被听见",
      icon: "camera",
    },
    {
      id: "record",
      index: "02",
      title: "录一个声音片段",
      englishTitle: "CAPTURE A SOUND NOW",
      description: "现场录音，或从原始声音库拾取",
      icon: "mic",
    },
  ] satisfies HomeEntranceMock[],
  entryDialogs: {
    diary: {
      eyebrow: "READ A SOUND DIARY",
      title: "声音日记从哪里来？",
      description: "拍摄或选择真实照片。取得图片后，才进入采样、识别与六字段确认。",
      actionLabel: "进入采样与转译",
      options: [
        { id: "camera", emoji: "📷", title: "拍一张照片", englishTitle: "TAKE A PHOTO", description: "使用设备相机拍下纸质声卡" },
        { id: "upload", emoji: "🖼️", title: "上传照片", englishTitle: "UPLOAD AN IMAGE", description: "从相册或电脑选择声卡照片" },
      ],
    },
    record: {
      eyebrow: "CAPTURE A SOUND NOW",
      title: "这一次从哪里听见？",
      description: "选择后将直接进入对应的录音页或原始声音库。",
      actionLabel: "进入采样与转译",
      options: [
        { id: "record", emoji: "🎙️", title: "现场录音", englishTitle: "RECORD NOW", description: "留住此刻真实发生的声音" },
        { id: "library", emoji: "🎧", title: "从声音库拾取", englishTitle: "BROWSE LIBRARY", description: "试听并选择一段未经调音的原声" },
      ],
    },
  } satisfies Record<HomeEntranceId, { eyebrow: string; title: string; description: string; actionLabel: string; options: readonly HomeEntryOptionMock[] }>,
  sounds: [
    { id: "wind", label: "沙沙", accessibleLabel: "播放风的声音", position: "cloud", audioSrc: "/demo/audio/wind.mp3" },
    { id: "forest-bird", label: "啾—", accessibleLabel: "播放森林里鸟的声音", position: "forest", audioSrc: "/demo/audio/forest-bird.mp3" },
    { id: "falling-apple", label: "嗒 · 嗒", accessibleLabel: "播放苹果落地的声音", position: "apple", audioSrc: "/demo/audio/falling-apple.mp3" },
  ] satisfies ForestSoundMock[],
} as const;
