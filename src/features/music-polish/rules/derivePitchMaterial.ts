import type { MusicPolishBrief } from "../contracts";

/**
 * 这一首作品的音高材料：主音、调式、和声进行。
 *
 * 不给材料时，模型会一律默认 C 大调，写出的和弦永远是 C-E-G 换八度——
 * 这是"每首背景听上去都一样"的直接原因。主音由素材指纹决定，
 * 调式由情绪决定，进行由情绪的激动程度决定，因此不同的孩子、
 * 不同的选择会落在不同的调上，而同样的输入仍然得到同样的结果。
 */
export interface PitchMaterial {
  version: "pitch-material-v1";
  /** 主音的 MIDI 音高，落在低音区，便于向上构建。 */
  tonicMidi: number;
  scaleName: ScaleName;
  /** 相对主音的半音集合。 */
  scaleSemitones: number[];
  /** 和声进行：每个和弦的根音相对主音的半音数。 */
  progression: number[];
  progressionName: string;
}

type ScaleName = "major" | "lydian" | "pentatonic" | "dorian" | "minor";

const SCALES: Record<ScaleName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

const PROGRESSIONS: Array<{ name: string; brightRoots: number[]; darkRoots: number[] }> = [
  { name: "安稳循环", brightRoots: [0, 7, 9, 5], darkRoots: [0, 10, 8, 10] },
  { name: "缓慢上行", brightRoots: [0, 5, 2, 7], darkRoots: [0, 5, 3, 7] },
  { name: "先扬后收", brightRoots: [0, 9, 5, 7], darkRoots: [0, 8, 5, 7] },
  { name: "低回往复", brightRoots: [0, 4, 5, 0], darkRoots: [0, 3, 5, 0] },
];

/** 主音候选：一个八度内的自然音，避免全部作品挤在同一个调上。 */
const TONIC_CANDIDATES = [48, 50, 51, 53, 55, 56, 58, 60];

export function derivePitchMaterial(brief: MusicPolishBrief): PitchMaterial {
  const valence = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.valence : 0;
  const arousal = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.arousal : 0;
  const signature = materialSignature(brief);

  const scaleName: ScaleName = valence >= 0.45 ? "lydian"
    : valence >= 0.15 ? "major"
      : valence <= -0.45 ? "minor"
        : valence <= -0.15 ? "dorian"
          : "pentatonic";
  const progression = PROGRESSIONS[signature % PROGRESSIONS.length];
  const dark = valence < 0;

  return {
    version: "pitch-material-v1",
    // 激动的作品主音抬高一点，安静的作品沉下去，同时保留素材指纹带来的差异。
    tonicMidi: TONIC_CANDIDATES[(signature + (arousal > 0.3 ? 2 : 0)) % TONIC_CANDIDATES.length],
    scaleName,
    scaleSemitones: SCALES[scaleName],
    progression: dark ? progression.darkRoots : progression.brightRoots,
    progressionName: progression.name,
  };
}

/** 由孩子的素材本身算出的稳定指纹：同样的素材永远得到同一个调。 */
function materialSignature(brief: MusicPolishBrief): number {
  const base = brief.pitchProfile.high * 7
    + brief.pitchProfile.mid * 11
    + brief.pitchProfile.low * 13
    + brief.patternProfile.repeat * 17
    + brief.patternProfile.bursts * 19
    + brief.patternProfile.fadeIn * 23
    + brief.soundCount * 29
    + Math.round(brief.durationSeconds);
  const positions = brief.soundEvents.reduce((sum, event) => sum + Math.round(event.startRatio * 37) + event.pitch.length, 0);
  return Math.abs(base + positions);
}

/** 写进提示词的音高清单：主音、可用音、和弦根音。 */
export function describePitchMaterial(material: PitchMaterial): string[] {
  const noteName = (midi: number) => NOTE_NAMES[((midi % 12) + 12) % 12];
  const scaleNotes = material.scaleSemitones.map((step) => noteName(material.tonicMidi + step)).join("、");
  const chordRoots = material.progression.map((root) => noteName(material.tonicMidi + root)).join(" → ");
  return [
    `  · 主音：${noteName(material.tonicMidi)}（MIDI ${material.tonicMidi}），调式：${SCALE_LABELS[material.scaleName]}。`,
    `  · 只使用这些音（可跨八度）：${scaleNotes}。`,
    `  · 和声进行按这个顺序走，每个和弦至少停留一段：${chordRoots}（${material.progressionName}）。`,
    "  · 和弦要真的换根音，不允许把同一个和弦搬到别的八度充当新和弦。",
  ];
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALE_LABELS: Record<ScaleName, string> = {
  major: "大调（明亮）",
  lydian: "利底亚（明亮而开阔）",
  pentatonic: "五声（中性、朴素）",
  dorian: "多利亚（偏暗但不苦）",
  minor: "小调（暗）",
};
