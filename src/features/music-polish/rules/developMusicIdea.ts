import type { SymbolicMusicPlan } from "@/src/domain/composition";
import type { MusicIdea, MusicPolishBrief } from "../contracts";
import type { PitchMaterial } from "./derivePitchMaterial";
import { MAX_BACKGROUND_LED_RATIO } from "./validateBackgroundArrangement";

type PlanEvent = SymbolicMusicPlan["events"][number];
type SectionName = MusicIdea["sections"][number]["name"];
type Motif = { steps: number[]; beats: number[] };

/**
 * 把模型给的"音乐想法"发展成完整的伴奏。
 *
 * 分工：模型负责**创作方向**（一句动机、四段性格、低音律动），
 * 程序负责**发展手法**（节拍落点、和声走动、重复与变形、与原声的一问一答、力度弧线、收尾）。
 *
 * 之所以这样分：让模型一次写完整份事件表时，它会退化成每隔几秒放一个和弦的地毯——
 * 没有记忆点，也听不出情绪差别。而"重复与变形"恰恰是可以用规则精确表达的部分，
 * 交给程序既更可靠，又保证同样的输入永远得到同样的作品。
 *
 * 记忆点从哪来：同一句动机在四个段落里以不同手法反复出现，并且每次陈述后都留有休止。
 * 情绪差别从哪来：激动改变和声更换速度、断奏比例与密度，平静则相反——都是结构性的差别，不只是音量。
 */

/** 假定 4/4：儿童作品的速度范围内，四拍一小节是最容易听出落点的。 */
const BEATS_PER_BAR = 4;
/**
 * 每次动机陈述之后至少留这么多拍的休止。
 * 这个数字同时守着两件事：句子之间的呼吸，以及"旋律独自在唱的时间不超过全曲三成"。
 */
const REST_BEATS_AFTER_STATEMENT = 3;
/** 回应孩子声音时的等待：太快像抢话，太慢就断了联系。 */
const ANSWER_DELAY_SECONDS = 0.32;
const MIN_ANSWER_GAP_SECONDS = 1.1;
const MAX_ANSWERS = 4;
/** 动机起音与孩子声音之间的安全距离。 */
const CHILD_CLEARANCE_SECONDS = 0.25;
/**
 * 只有**短促**的原声才挡住伴奏的起音。
 * 风声、雨声这类长铺底本来就是织体，在它上面演奏是正常写法；
 * 若连它们也算障碍，覆盖率高的作品会一个旋律音都放不下——实盘就出现过整层没有旋律。
 */
const BLOCKING_SOUND_MAX_SECONDS = 3;

/**
 * 各段的力度弧线：起—展—高潮—收。第一个音再加重音，让动机的头听得出来。
 *
 * 这些数字直接决定背景听不听得见：velocity 近似就是振幅，
 * 0.1 只有 −20 dBFS，再经过背景总线就沉到原声以下 25 dB 了。
 * 稀疏的编排必须比密集的地毯写得更响，因为没有多个声部叠加来撑响度。
 * 上限 0.5 由方案格式约定，这里留出余量给重音。
 */
const SECTION_VELOCITY: Record<SectionName, number> = { intro: 0.2, development: 0.26, peak: 0.36, ending: 0.17 };
const FIRST_NOTE_ACCENT = 0.06;
/**
 * 铺底自己的力度，**高于旋律**。
 *
 * 看上去反直觉，但铺底同时被三件事削弱：进入保持段后只剩八成、四音和弦要做叠音补偿、
 * 而且它是持续音而不是瞬态峰值。按旋律的力度写，铺底会比旋律低十几 dB，
 * 听感上就只剩零星的点、没有连贯的底——实测曾低到 −37 dBFS。
 */
const PAD_VELOCITY: Record<SectionName, number> = { intro: 0.34, development: 0.38, peak: 0.44, ending: 0.3 };
/** 模型说不要铺底时只是变薄，不是消失。 */
const THIN_PAD_DROP = 0.1;
const BASS_VELOCITY_DROP = 0.08;

/** 每段用哪些发展手法。同一句动机因此听得出"在长大"，而不是被搬来搬去。 */
const SECTION_TECHNIQUES: Record<SectionName, DevelopmentTechnique[]> = {
  intro: ["statement", "fragment"],
  development: ["sequence", "statement", "ornament"],
  peak: ["diminution", "inversion", "sequence"],
  ending: ["augmentation", "fragment"],
};

const STATEMENTS: Record<MusicIdea["sections"][number]["density"], number> = { sparse: 1, medium: 2, busy: 3 };
/**
 * 旋律的目标音区中心。
 * 和铺底一样用"中心音高"而不是固定偏移：逐个音夹进音域时，
 * 越界的音会一个个撞在边界上被压成同一个音——听上去就是一个单音在原地循环。
 */
const REGISTER_CENTER = { low: 50, mid: 62, high: 72 } as const;

export type DevelopmentTechnique =
  | "statement"
  | "sequence"
  | "fragment"
  | "inversion"
  | "diminution"
  | "augmentation"
  | "ornament";

export interface ArrangementShape {
  /** 和声在整首里的走动：每个和弦从哪到哪、根音是第几级。 */
  harmony: Array<{ startSeconds: number; endSeconds: number; scaleStep: number }>;
  /** 对孩子声音的回应次数，用来确认伴奏真的在"搭话"。 */
  answerCount: number;
  /** 动机一共陈述了多少次。 */
  statementCount: number;
}

export function developMusicIdea(
  idea: MusicIdea,
  brief: MusicPolishBrief,
  material: PitchMaterial,
): { plan: SymbolicMusicPlan; shape: ArrangementShape } {
  const grid = buildGrid(brief);
  // 旋律"独自在唱"的时间预算：孩子的素材越稀疏，背景越要克制，
  // 而不是拿旋律去把空白填满。这样"原声为主"由结构保证，不靠事后校验拦。
  const budget = new LeadBudget(brief);
  const arousal = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.arousal : 0;
  const colorTilt = brief.emotionCoordinates.enabled ? brief.emotionCoordinates.valence : 0;
  const harmony = buildHarmony(brief, material, grid, arousal);
  const motif: Motif = { steps: idea.motifDegrees, beats: idea.motifBeats };

  // 先排"一问一答"：它锚定在孩子的声音之后，位置本来就是定的；
  // 剩下的额度再留给段落里的动机陈述，避免预留机制白白锁住用不掉的时间。
  const answers = renderAnswers({ motif, brief, grid, material, harmony, budget });
  const events: PlanEvent[] = [];
  let statementCount = 0;

  brief.sections.forEach((section, index) => {
    const character = idea.sections.find((item) => item.name === section.name) ?? idea.sections[index % idea.sections.length];
    if (!character) return;
    const techniques = SECTION_TECHNIQUES[section.name];
    const baseVelocity = SECTION_VELOCITY[section.name];
    // 激动的作品多用断奏，安静的作品连奏；这是听得出情绪的一半。
    const staccato = arousal >= 0.25;

    let cursor = snapToBeat(section.startSeconds, grid);
    for (let statement = 0; statement < STATEMENTS[character.density]; statement += 1) {
      const technique = techniques[statement % techniques.length];
      const full = transformMotif(motif, technique, statement);
      // 整句放不下时退成片段——这本来就是"片段化"手法，比整句不出现好得多。
      const shaped = placeStatement(cursor, full, grid, brief, section.endSeconds) !== null
        ? full
        : transformMotif(full, "fragment", statement);
      const placement = placeStatement(cursor, shaped, grid, brief, section.endSeconds);
      if (placement === null) break;
      if (!budget.canAfford(placement, motifSeconds(shaped, grid))) break;

      const statementEvents = renderMotif({
        motif: shaped,
        startSeconds: placement,
        grid,
        material,
        harmony,
        registerCenter: REGISTER_CENTER[character.register] + (technique === "inversion" ? 4 : 0),
        voice: character.voice,
        velocity: baseVelocity,
        staccato,
        limitSeconds: section.endSeconds,
      });
      statementEvents.forEach((event) => budget.spend(event.startSeconds, event.durationSeconds));
      events.push(...statementEvents);
      statementCount += 1;
      cursor = placement + motifSeconds(shaped, grid) + REST_BEATS_AFTER_STATEMENT * grid.secondsPerBeat;
    }

    // 铺底始终存在：它是背景连贯感的来源，不能由模型一个布尔值关掉。
    // padSustain 只决定厚薄，不决定有无。
    events.push(...renderPad(section, harmony, material, PAD_VELOCITY[section.name] - (idea.padSustain ? 0 : THIN_PAD_DROP), grid, colorTilt));
    events.push(...renderBass(idea.bassPulse, section, harmony, material, grid, baseVelocity, arousal));
  });

  const all = [...events, ...answers]
    .filter((event) => event.startSeconds >= 0 && event.startSeconds < brief.durationSeconds - 0.05 && event.durationSeconds >= 0.08)
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .slice(0, 96);

  return {
    plan: {
      version: "symbolic-music-plan-v1",
      bpm: brief.bpm,
      durationSeconds: brief.durationSeconds,
      events: all.length > 0 ? closeWithLastChord(all, brief, material, colorTilt) : [fallbackPad(brief, material)],
    },
    shape: { harmony, answerCount: answers.length, statementCount },
  };
}

/**
 * 旋律独自发声的时间预算。
 *
 * 规则要求"背景为主"不超过全曲三成；这里在生成阶段就按预算发放，
 * 而不是生成完再让校验去拒绝——被拒绝的代价是整首退回本地方案。
 * 只有落在孩子声音之外的那部分才计入，因为原声在响时背景不算主角。
 */
class LeadBudget {
  private spentSeconds = 0;
  private readonly limitSeconds: number;

  constructor(private readonly brief: MusicPolishBrief) {
    // 留一点余量，避免刚好卡在边界上。
    this.limitSeconds = brief.durationSeconds * MAX_BACKGROUND_LED_RATIO * 0.92;
  }

  canAfford(startSeconds: number, durationSeconds: number): boolean {
    return this.spentSeconds + this.aloneSeconds(startSeconds, durationSeconds) <= this.limitSeconds;
  }

  spend(startSeconds: number, durationSeconds: number): void {
    this.spentSeconds += this.aloneSeconds(startSeconds, durationSeconds);
  }

  /** 这段时间里，孩子没有出声的部分有多长。 */
  private aloneSeconds(startSeconds: number, durationSeconds: number): number {
    const end = startSeconds + durationSeconds;
    const covered = this.brief.soundEvents.reduce((sum, sound) => (
      sum + Math.max(0, Math.min(end, sound.endSeconds) - Math.max(startSeconds, sound.startSeconds))
    ), 0);
    return Math.max(0, durationSeconds - covered);
  }
}

// ---------- 节拍与和声 ----------

interface Grid { secondsPerBeat: number; barSeconds: number }

function buildGrid(brief: MusicPolishBrief): Grid {
  const secondsPerBeat = 60 / brief.bpm;
  return { secondsPerBeat, barSeconds: secondsPerBeat * BEATS_PER_BAR };
}

/** 起音统一对齐到十六分音符：既允许切分，又不会飘。 */
const SUBDIVISION = 0.25;

function snapToBeat(seconds: number, grid: Grid): number {
  const unit = grid.secondsPerBeat * SUBDIVISION;
  return round(Math.round(seconds / unit) * unit);
}

/** 只向后对齐：用于回应与铺底，避免被吸回到孩子的声音上。 */
function snapForward(seconds: number, grid: Grid): number {
  const unit = grid.secondsPerBeat * SUBDIVISION;
  return round(Math.ceil(seconds / unit) * unit);
}

function snapToSubdivision(seconds: number, grid: Grid): number {
  const unit = grid.secondsPerBeat * SUBDIVISION;
  return round(Math.max(unit, Math.round(seconds / unit) * unit));
}

/**
 * 和声在整首里走动，而不是一段一个和弦。
 * 情绪越激动换得越快：这是"听得出情绪"的另一半。
 */
function buildHarmony(
  brief: MusicPolishBrief,
  material: PitchMaterial,
  grid: Grid,
  arousal: number,
): ArrangementShape["harmony"] {
  const barsPerChord = arousal >= 0.35 ? 1 : arousal <= -0.35 ? 3 : 2;
  const chordSeconds = Math.max(2, grid.barSeconds * barsPerChord);
  const steps = material.progression.map((semitones) => nearestScaleStep(semitones, material.scaleSemitones));
  const harmony: ArrangementShape["harmony"] = [];
  for (let index = 0; index * chordSeconds < brief.durationSeconds; index += 1) {
    const startSeconds = round(index * chordSeconds);
    harmony.push({
      startSeconds,
      endSeconds: round(Math.min(brief.durationSeconds, startSeconds + chordSeconds)),
      scaleStep: steps[index % steps.length],
    });
  }
  return harmony;
}

function chordStepAt(seconds: number, harmony: ArrangementShape["harmony"]): number {
  return harmony.find((chord) => seconds >= chord.startSeconds && seconds < chord.endSeconds)?.scaleStep
    ?? harmony[harmony.length - 1]?.scaleStep
    ?? 0;
}

/** 把半音距离换成最近的音阶级数，保证一切都留在调内。 */
function nearestScaleStep(semitones: number, scale: number[]): number {
  let bestStep = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  scale.forEach((value, step) => {
    const distance = Math.abs(value - ((semitones % 12) + 12) % 12);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStep = step;
    }
  });
  return bestStep;
}

// ---------- 动机的变形 ----------

/**
 * 真正的发展手法，而不是固定步长的搬移。
 * 每一种都是编曲里有名字的做法，听感上能分辨。
 */
function transformMotif(motif: Motif, technique: DevelopmentTechnique, statementIndex: number): Motif {
  const head = motif.steps[0] ?? 0;
  switch (technique) {
    case "sequence":
      // 模进：整句往上挪一个音阶级，听得出是同一句换了高度。
      return { steps: motif.steps.map((step) => step + 1 + statementIndex), beats: motif.beats };
    case "fragment": {
      // 片段化：只用前半句，留下想象空间。
      const keep = Math.max(2, Math.ceil(motif.steps.length / 2));
      return { steps: motif.steps.slice(0, keep), beats: motif.beats.slice(0, keep) };
    }
    case "inversion":
      // 倒影：音程方向反过来，轮廓仍然认得出。
      return { steps: motif.steps.map((step) => head * 2 - step), beats: motif.beats };
    case "diminution":
      // 紧缩：时值减半，显得急促。
      return { steps: motif.steps, beats: motif.beats.map((beat) => Math.max(0.25, beat * 0.5)) };
    case "augmentation":
      // 扩张：时值加倍，用来收尾最自然。
      return { steps: motif.steps, beats: motif.beats.map((beat) => Math.min(4, beat * 1.8)) };
    case "ornament": {
      // 加花：在第二个音前插一个邻音，句子更活。
      const steps = [...motif.steps];
      const beats = [...motif.beats];
      if (steps.length >= 2) {
        steps.splice(1, 0, steps[1] + 1);
        beats.splice(1, 0, Math.max(0.25, beats[1] * 0.5));
        beats[2] = Math.max(0.25, beats[2] * 0.5);
      }
      return { steps, beats };
    }
    default:
      return motif;
  }
}

function motifSeconds(motif: Motif, grid: Grid): number {
  return motif.beats.reduce((sum, beat) => sum + snapToSubdivision(beat * grid.secondsPerBeat, grid), 0);
}

/**
 * 找一个整句都放得下的位置：**动机的每一个起音**都要避开孩子的声音，而不只是第一个。
 * 句子是一个整体，宁可整句往后挪，也不要为了躲让把它拆散。
 */
function placeStatement(
  from: number,
  motif: Motif,
  grid: Grid,
  brief: MusicPolishBrief,
  limitSeconds: number,
): number | null {
  const onsets = onsetOffsets(motif, grid);
  let start = snapToBeat(from, grid);
  for (let guard = 0; guard <= brief.soundEvents.length + 1; guard += 1) {
    if (start + motifSeconds(motif, grid) > limitSeconds) return null;
    const clash = onsets
      .map((offset) => collidingSound(start + offset, brief))
      .find((sound) => sound !== undefined);
    if (!clash) return start;
    start = snapToBeat(clash.endSeconds + CHILD_CLEARANCE_SECONDS, grid);
  }
  return null;
}

/** 动机里每个音相对句首的时间偏移。 */
function onsetOffsets(motif: Motif, grid: Grid): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  motif.beats.forEach((beat) => {
    offsets.push(cursor);
    cursor += snapToSubdivision(beat * grid.secondsPerBeat, grid);
  });
  return offsets;
}

function collidingSound(seconds: number, brief: MusicPolishBrief) {
  return brief.soundEvents.find((event) => (
    event.endSeconds - event.startSeconds <= BLOCKING_SOUND_MAX_SECONDS
    && seconds > event.startSeconds - CHILD_CLEARANCE_SECONDS
    && seconds < event.endSeconds
  ));
}

// ---------- 渲染 ----------

function renderMotif(input: {
  motif: Motif;
  startSeconds: number;
  grid: Grid;
  material: PitchMaterial;
  harmony: ArrangementShape["harmony"];
  registerCenter: number;
  voice: MusicIdea["sections"][number]["voice"];
  velocity: number;
  staccato: boolean;
  limitSeconds: number;
}): PlanEvent[] {
  const events: PlanEvent[] = [];
  let cursor = input.startSeconds;
  // 整句一起排到目标音区：逐个音夹取会把越界的音压成同一个高度，
  // 一句旋律就退化成一个单音在原地循环。
  const notes = voicePhrase(
    input.motif.steps.map((step) => step + chordStepAt(input.startSeconds, input.harmony)),
    input.material,
    input.registerCenter,
  );

  input.motif.steps.forEach((step, index) => {
    const slotSeconds = snapToSubdivision((input.motif.beats[index] ?? 1) * input.grid.secondsPerBeat, input.grid);
    if (cursor + slotSeconds > input.limitSeconds) return;
    // 断奏只占格子的一部分，连奏几乎填满；这一点比音量更能表达情绪。
    const sounding = slotSeconds * (input.staccato ? 0.55 : 0.92);
    events.push({
      startSeconds: round(cursor),
      durationSeconds: round(Math.max(0.12, sounding)),
      midiNotes: [notes[index]],
      voice: input.voice,
      // 动机的第一个音加重音，是"记得住"的关键。
      velocity: round(clampVelocity(input.velocity + (index === 0 ? FIRST_NOTE_ACCENT : 0))),
    });
    cursor += slotSeconds;
  });
  return events;
}

/**
 * 一问一答：孩子的声音结束后，在空隙里用动机的头两个音回应，并且用相反的音区。
 * 这是伴奏与原声之间"听得出关系"的地方，也是项目一直想要的呼应。
 */
function renderAnswers(input: {
  motif: Motif;
  brief: MusicPolishBrief;
  grid: Grid;
  material: PitchMaterial;
  harmony: ArrangementShape["harmony"];
  budget: LeadBudget;
}): PlanEvent[] {
  const { brief, grid, material, harmony } = input;
  const fragment = transformMotif(input.motif, "fragment", 0);
  const events: PlanEvent[] = [];

  brief.soundEvents.forEach((sound, index) => {
    if (events.length >= MAX_ANSWERS) return;
    const nextStart = brief.soundEvents[index + 1]?.startSeconds ?? brief.durationSeconds;
    const gap = nextStart - sound.endSeconds;
    if (gap < MIN_ANSWER_GAP_SECONDS) return;

    const start = snapForward(sound.endSeconds + ANSWER_DELAY_SECONDS, grid);
    if (start + grid.secondsPerBeat > nextStart) return;
    // 孩子的声音偏高就往低处答，偏低就往高处答。
    // 孩子的声音偏高就往低处答，偏低就往高处答。
    const registerCenter = sound.pitch === "high" ? 50 : sound.pitch === "low" ? 71 : 62;
    const answerNotes = voicePhrase(fragment.steps.map((step) => step + chordStepAt(start, harmony)), material, registerCenter);

    let cursor = start;
    fragment.steps.forEach((step, position) => {
      // 时值可以收短，但位置必须留在网格上，否则回应听起来是飘的。
      const slotSeconds = snapToSubdivision((fragment.beats[position] ?? 1) * grid.secondsPerBeat, grid);
      if (cursor + slotSeconds > nextStart - 0.1) return;
      if (collidingSound(cursor, brief)) return;
      if (!input.budget.canAfford(cursor, slotSeconds)) return;
      input.budget.spend(cursor, slotSeconds);
      events.push({
        startSeconds: round(cursor),
        durationSeconds: round(Math.max(0.12, slotSeconds * 0.8)),
        midiNotes: [answerNotes[position]],
        voice: "pluck",
        velocity: round(clampVelocity(0.24 - position * 0.03)),
      });
      cursor += slotSeconds;
    });
  });

  return events;
}

/**
 * 铺底和弦的色彩与音区由**愉悦度**决定。
 *
 * 只靠大小调音阶是听不出"开心／不开心"的——动机里往往只有一个音落在大小三度上。
 * 加一个色彩音、并整体挪动音区，差别才明显：
 * 偏亮加大六度、音区抬高；偏暗加七度、音区压低。
 */
function padChordSteps(colorTilt: number): number[] {
  if (colorTilt >= 0.2) return [0, 2, 4, 5];
  if (colorTilt <= -0.2) return [0, 2, 4, 6];
  return [0, 2, 4];
}

/**
 * 铺底的目标音区中心。
 * 用"中心音高"而不是固定的半音偏移：主音落在哪一个调上都能稳定拉开明暗，
 * 不会因为撞到音域边界被八度归位抵消掉。
 */
function padRegisterCenter(colorTilt: number): number {
  if (colorTilt >= 0.2) return 62;
  if (colorTilt <= -0.2) return 45;
  return 53;
}

/** 长音铺底跟着和声走，一个和弦一块，而不是一段一整块。 */
function renderPad(
  section: MusicPolishBrief["sections"][number],
  harmony: ArrangementShape["harmony"],
  material: PitchMaterial,
  velocity: number,
  grid: Grid,
  colorTilt: number,
): PlanEvent[] {
  const steps = padChordSteps(colorTilt);
  const registerCenter = padRegisterCenter(colorTilt);
  return harmony
    .filter((chord) => chord.endSeconds > section.startSeconds && chord.startSeconds < section.endSeconds)
    .flatMap((chord) => {
      // 段落边界本身不在网格上，这里对齐一次，避免长音块把整首拉歪。
      const start = snapForward(Math.max(chord.startSeconds, section.startSeconds), grid);
      const end = Math.min(chord.endSeconds, section.endSeconds);
      // 太短的和弦碎块在长起音下根本发不出声，反而制造断续感。
      if (end - start < 1.2) return [];
      return [{
        startSeconds: round(start),
        durationSeconds: round(Math.max(0.5, end - start)),
        midiNotes: voiceChord(steps.map((step) => step + chord.scaleStep), material, registerCenter),
        voice: "pad" as const,
        velocity: round(clampVelocity(velocity)),
      }];
    });
}

function renderBass(
  pulse: MusicIdea["bassPulse"],
  section: MusicPolishBrief["sections"][number],
  harmony: ArrangementShape["harmony"],
  material: PitchMaterial,
  grid: Grid,
  velocity: number,
  arousal: number,
): PlanEvent[] {
  if (pulse === "none") return [];
  // 激动时低音走得更密，安静时只在和弦换的地方点一下。
  const beats = pulse === "steady" ? (arousal >= 0.3 ? 1 : 2) : BEATS_PER_BAR;
  const step = grid.secondsPerBeat * beats;
  const events: PlanEvent[] = [];
  for (let start = snapToBeat(section.startSeconds, grid); start < section.endSeconds - 0.25; start += step) {
    const chordStep = chordStepAt(start, harmony);
    events.push({
      startSeconds: round(start),
      durationSeconds: round(Math.min(step * 0.65, section.endSeconds - start)),
      midiNotes: [scaleNote(chordStep, material, -24)],
      voice: "bass",
      velocity: round(clampVelocity(velocity - BASS_VELOCITY_DROP)),
    });
  }
  return events;
}

/**
 * 收尾：落回**主音**的长和弦并拉到结尾。
 * 刻意不用当时那一格的和弦——回到主音才听得出"结束了"，而不是"停了"。
 */
function closeWithLastChord(
  events: PlanEvent[],
  brief: MusicPolishBrief,
  material: PitchMaterial,
  colorTilt: number,
): PlanEvent[] {
  const targetEnd = brief.durationSeconds - 0.2;
  const closingStart = snapToBeatDown(Math.max(0, targetEnd - Math.max(2, brief.durationSeconds * 0.06)), brief);
  return [
    ...events.filter((event) => event.startSeconds < targetEnd - 0.6),
    {
      startSeconds: round(closingStart),
      durationSeconds: round(Math.max(1.2, targetEnd - closingStart)),
      midiNotes: voiceChord(padChordSteps(colorTilt), material, padRegisterCenter(colorTilt)),
      voice: "pad" as const,
      velocity: round(clampVelocity(PAD_VELOCITY.ending)),
    },
  ].sort((a, b) => a.startSeconds - b.startSeconds);
}

function snapToBeatDown(seconds: number, brief: MusicPolishBrief): number {
  const unit = (60 / brief.bpm) * SUBDIVISION;
  return round(Math.floor(seconds / unit) * unit);
}

function fallbackPad(brief: MusicPolishBrief, material: PitchMaterial): PlanEvent {
  return {
    startSeconds: 0,
    durationSeconds: round(Math.max(1, brief.durationSeconds - 0.2)),
    midiNotes: voiceChord([0, 2, 4], material, padRegisterCenter(0)),
    voice: "pad",
    velocity: round(clampVelocity(PAD_VELOCITY.intro)),
  };
}

/**
 * 把一整句旋律排到目标音区：先算出原始音高，再整句一起移八度。
 * 与 voiceChord 同一个道理——保住句子的轮廓，而不是把越界的音钉在边界上。
 */
function voicePhrase(steps: number[], material: PitchMaterial, targetCenterMidi: number): number[] {
  const raw = steps.map((step) => rawScaleNote(step, material, 0));
  const center = raw.reduce((sum, note) => sum + note, 0) / raw.length;
  let shift = Math.round((targetCenterMidi - center) / 12) * 12;
  while (Math.min(...raw) + shift < 40) shift += 12;
  while (Math.max(...raw) + shift > 84) shift -= 12;
  return raw.map((note) => Math.max(36, Math.min(84, note + shift)));
}

/**
 * 和弦的排列：整块一起移八度，而不是逐个音夹取。
 *
 * 逐音夹取会把超出音域的音顶到边界上，撞出小二度——低音区的半音堆叠很难听。
 * 实测偏暗的和弦曾出现 [36,37,41,44]，最低两个音只差一个半音，就是这么来的。
 */
function voiceChord(steps: number[], material: PitchMaterial, targetCenterMidi: number): number[] {
  const raw = steps.map((step) => rawScaleNote(step, material, 0));
  const center = raw.reduce((sum, note) => sum + note, 0) / raw.length;
  let shift = Math.round((targetCenterMidi - center) / 12) * 12;
  while (Math.min(...raw) + shift < 36) shift += 12;
  while (Math.max(...raw) + shift > 84) shift -= 12;
  return raw.map((note) => Math.max(24, Math.min(96, note + shift)));
}

/** 未经音域夹取的音高，供和弦排列使用。 */
function rawScaleNote(step: number, material: PitchMaterial, offsetSemitones: number): number {
  const scale = material.scaleSemitones;
  const size = scale.length;
  const octave = Math.floor(step / size);
  const index = ((step % size) + size) % size;
  return Math.round(material.tonicMidi + octave * 12 + scale[index] + offsetSemitones);
}

/** 音阶级数 → MIDI；负数与跨八度都按音阶循环处理，保证一切留在调内。 */
function scaleNote(step: number, material: PitchMaterial, offsetSemitones: number): number {
  const scale = material.scaleSemitones;
  const size = scale.length;
  const octave = Math.floor(step / size);
  const index = ((step % size) + size) % size;
  return Math.max(36, Math.min(84, Math.round(material.tonicMidi + octave * 12 + scale[index] + offsetSemitones)));
}

function clampVelocity(value: number) {
  return Math.max(0.04, Math.min(0.5, value));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
