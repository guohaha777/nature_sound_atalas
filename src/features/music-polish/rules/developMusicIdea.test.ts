import { describe, expect, it } from "vitest";
import { arrangeCompositionV1 } from "@/src/domain/composition";
import { MOCK_SOUND_CARDS, MOCK_SOUND_UNITS } from "@/src/mocks/mockData";
import type { MusicIdea } from "../contracts";
import { buildMusicPolishBrief } from "./buildMusicPolishBrief";
import { derivePitchMaterial } from "./derivePitchMaterial";
import { developMusicIdea } from "./developMusicIdea";
import { backgroundToneSettings, voiceTrimDb } from "@/src/audio/mixing";
import { validateBackgroundArrangement } from "./validateBackgroundArrangement";

function briefFor(emotion?: { valence: number; arousal: number }, durationSeconds = 30) {
  const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index < 3 }));
  const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, durationSeconds);
  const withEmotion = emotion
    ? { ...composition, emotionIntent: { enabled: true, valence: emotion.valence, arousal: emotion.arousal, label: null, mappingVersion: "emotion-mapping-v1" as const } }
    : composition;
  return buildMusicPolishBrief(withEmotion, MOCK_SOUND_CARDS, units);
}

const idea: MusicIdea = {
  version: "music-idea-v1",
  motifDegrees: [0, 4, 2, 1],
  motifBeats: [1, 0.5, 0.5, 2],
  sections: [
    { name: "intro", density: "sparse", register: "mid", voice: "mallet" },
    { name: "development", density: "medium", register: "mid", voice: "pluck" },
    { name: "peak", density: "busy", register: "high", voice: "mallet" },
    { name: "ending", density: "sparse", register: "low", voice: "pluck" },
  ],
  bassPulse: "slow",
  padSustain: true,
};

function develop(emotion?: { valence: number; arousal: number }, durationSeconds = 30) {
  const brief = briefFor(emotion, durationSeconds);
  return { brief, ...developMusicIdea(idea, brief, derivePitchMaterial(brief)) };
}

describe("把音乐想法发展成伴奏", () => {
  it("动机反复出现，形成记忆点", () => {
    const { shape } = develop();
    // 陈述次数受"背景独唱不超过三成"的预算限制，素材越稀疏越克制；
    // 但连同回应在内，同一句动机至少要露面五次才谈得上记忆点。
    expect(shape.statementCount).toBeGreaterThanOrEqual(3);
    expect(shape.statementCount + shape.answerCount).toBeGreaterThanOrEqual(5);
  });

  it("和声在整首里走动，不是一段一个和弦", () => {
    const { shape, brief } = develop();
    const roots = shape.harmony.map((chord) => chord.scaleStep);
    expect(shape.harmony.length).toBeGreaterThan(brief.sections.length);
    expect(new Set(roots).size).toBeGreaterThanOrEqual(2);
  });

  it("会在孩子的声音之后回应，而不只是避开", () => {
    const { shape } = develop();
    expect(shape.answerCount).toBeGreaterThan(0);
  });

  it("动机的起音不会压在孩子的声音上", () => {
    const { plan, brief } = develop();
    const melodic = plan.events.filter((event) => event.voice !== "pad" && event.voice !== "bass");
    melodic.forEach((event) => {
      const clash = brief.soundEvents.find((sound) => (
        event.startSeconds > sound.startSeconds - 0.24 && event.startSeconds < sound.endSeconds - 0.01
      ));
      expect(clash, `${event.startSeconds} 秒的音压在原声上`).toBeUndefined();
    });
  });

  it("句子之间有休止，不会连成一片", () => {
    const { plan, brief } = develop();
    const melodic = plan.events.filter((event) => event.voice !== "pad" && event.voice !== "bass").sort((a, b) => a.startSeconds - b.startSeconds);
    const gaps = melodic.slice(1).map((event, index) => event.startSeconds - (melodic[index].startSeconds + melodic[index].durationSeconds));
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(60 / brief.bpm);
  });

  it("起音落在十六分音符网格上，听得出落点", () => {
    const { plan, brief } = develop();
    const unit = (60 / brief.bpm) * 0.25;
    const offGrid = plan.events.filter((event) => {
      const units = event.startSeconds / unit;
      return Math.abs(units - Math.round(units)) > 0.02;
    });
    expect(offGrid.map((event) => event.startSeconds)).toEqual([]);
  });

  it("力度有起伏，高潮比引子响、结尾最轻", () => {
    const { plan, brief } = develop();
    const peakSection = brief.sections.find((section) => section.name === "peak")!;
    const introSection = brief.sections.find((section) => section.name === "intro")!;
    const inSection = (section: typeof peakSection) => plan.events
      .filter((event) => event.startSeconds >= section.startSeconds && event.startSeconds < section.endSeconds)
      .map((event) => event.velocity);

    expect(Math.max(...inSection(peakSection))).toBeGreaterThan(Math.max(...inSection(introSection)));
    expect(plan.events.at(-1)!.velocity).toBeLessThan(Math.max(...plan.events.map((event) => event.velocity)));
  });

  it("结尾落回主音的和弦并铺到末尾，不会戛然而止", () => {
    const { plan, brief } = develop();
    const last = plan.events.at(-1)!;
    expect(last.voice).toBe("pad");
    expect(last.startSeconds + last.durationSeconds).toBeGreaterThan(brief.durationSeconds - 0.5);
  });

  it("发展出来的伴奏直接通过编排检查", () => {
    const { plan, brief } = develop();
    const check = validateBackgroundArrangement(plan, brief);
    expect(check.ok, check.reason ?? "").toBe(true);
  });

  it("同样的想法与素材永远得到同一份伴奏", () => {
    expect(develop().plan).toEqual(develop().plan);
  });
});

describe("情绪造成结构性差别", () => {
  it("激动时和声换得更快", () => {
    const excited = develop({ valence: 0.3, arousal: 0.8 }).shape.harmony.length;
    const calm = develop({ valence: 0.3, arousal: -0.8 }).shape.harmony.length;
    expect(excited).toBeGreaterThan(calm);
  });

  it("激动时用断奏，平静时用连奏", () => {
    const soundingRatio = (emotion: { valence: number; arousal: number }) => {
      const { plan, brief } = develop(emotion);
      const secondsPerBeat = 60 / brief.bpm;
      const melodic = plan.events.filter((event) => event.voice !== "pad" && event.voice !== "bass");
      return melodic.reduce((sum, event) => sum + event.durationSeconds / secondsPerBeat, 0) / melodic.length;
    };

    expect(soundingRatio({ valence: 0, arousal: 0.8 })).toBeLessThan(soundingRatio({ valence: 0, arousal: -0.8 }));
  });

  it("两种情绪产生的伴奏明显不同", () => {
    const bright = develop({ valence: 0.8, arousal: 0.6 }).plan;
    const blue = develop({ valence: -0.8, arousal: -0.6 }).plan;
    expect(bright.events).not.toEqual(blue.events);
  });
});

describe("背景必须听得见", () => {
  /**
   * 这条守着一个真实发生过的回归：编排从密集地毯改成稀疏旋律后，
   * 力度沿用旧值，结果整层背景比原声低了 30 dB，试听时完全听不到。
   * 稀疏的写法没有多声部叠加撑响度，必须写得更响。
   */
  it("旋律自身的力度在可听范围内", () => {
    // 这里只守编排自身的动态，不涉及背景总线的音量——
    // 总线落差是留给耳朵调的旋钮（BACKGROUND_OFFSET_DB），不该由这条测试锁死。
    const { plan } = develop();
    const melodic = plan.events.filter((event) => event.voice === "mallet" || event.voice === "pluck" || event.voice === "pulse");
    const peakVelocity = Math.max(...melodic.map((event) => event.velocity));

    expect(peakVelocity).toBeGreaterThanOrEqual(0.24);
    expect(peakVelocity).toBeLessThanOrEqual(0.5);
  });

  it("铺底垫得住：估算电平比旋律低，但不至于消失", () => {
    const { plan } = develop();
    const pad = plan.events.filter((event) => event.voice === "pad")[0];
    const melody = plan.events.filter((event) => event.voice === "mallet" || event.voice === "pluck")[0];
    const sustain = backgroundToneSettings({ brightness: 0.5, space: 0.4, attackShape: "natural" }).padSustainLevel;
    // 两者走同一条总线，所以只比较它们之间的差值，与总线音量无关。
    const padDb = 20 * Math.log10(pad.velocity * sustain) + voiceTrimDb("pad", pad.midiNotes.length);
    const melodyDb = 20 * Math.log10(melody.velocity) + voiceTrimDb("mallet", 1);

    // 铺底要退在旋律后面，但差距不能大到听不见——这是"断断续续"的成因。
    expect(padDb).toBeLessThan(melodyDb);
    expect(melodyDb - padDb).toBeLessThanOrEqual(8);
  });
});

describe("素材密集或动机很长时也要发得出旋律", () => {
  /**
   * 这条守着一个实盘回归：真实作品经过"自然声贯穿"补齐后，原声覆盖可达 92%，
   * 若长铺底也算障碍、且整句放不下就放弃，整层背景会一个旋律音都没有。
   */
  const longMotifIdea: MusicIdea = {
    ...idea,
    // 八拍的长句：任何普通空隙都塞不下。
    motifDegrees: [0, 2, 4, 5],
    motifBeats: [2, 2, 2, 2],
  };

  function denseBrief() {
    const units = MOCK_SOUND_UNITS.map((unit, index) => ({ ...unit, active: index < 3 }));
    const composition = arrangeCompositionV1(MOCK_SOUND_CARDS, units, 1, 30);
    const brief = buildMusicPolishBrief(composition, MOCK_SOUND_CARDS, units);
    // 模拟贯穿补齐后的密集原声：一连串 4 秒的长铺底。
    return {
      ...brief,
      soundEvents: Array.from({ length: 7 }, (_, index) => ({
        ...brief.soundEvents[0],
        soundIndex: index + 1,
        startSeconds: index * 4,
        endSeconds: index * 4 + 3.8,
      })),
    };
  }

  it("长铺底之上仍然能演奏，不会整层没有旋律", () => {
    const brief = denseBrief();
    const { plan } = developMusicIdea(idea, brief, derivePitchMaterial(brief));
    const melodic = plan.events.filter((event) => event.voice !== "pad" && event.voice !== "bass");
    expect(melodic.length).toBeGreaterThan(0);
  });

  it("动机长到放不下时退成片段，而不是消失", () => {
    const brief = denseBrief();
    const { plan, shape } = developMusicIdea(longMotifIdea, brief, derivePitchMaterial(brief));
    const melodic = plan.events.filter((event) => event.voice !== "pad" && event.voice !== "bass");
    expect(shape.statementCount).toBeGreaterThan(0);
    expect(melodic.length).toBeGreaterThan(0);
  });
});

describe("背景要连贯，不能只剩零星的旋律", () => {
  /**
   * 这条守着一个真实反馈："听起来断断续续"。
   * 事件层面其实是满覆盖的，问题出在铺底——它必须始终存在，
   * 而且不能被模型的一个布尔值关掉，否则背景就只剩几个短促的旋律音。
   */
  it("整首都有东西垫着，没有大段空白", () => {
    const { plan, brief } = develop();
    const intervals = plan.events
      .map((event) => ({ start: event.startSeconds, end: Math.min(brief.durationSeconds, event.startSeconds + event.durationSeconds) }))
      .sort((a, b) => a.start - b.start);
    let cursor = 0;
    let longestGap = 0;
    intervals.forEach((interval) => {
      longestGap = Math.max(longestGap, interval.start - cursor);
      cursor = Math.max(cursor, interval.end);
    });
    longestGap = Math.max(longestGap, brief.durationSeconds - cursor);

    expect(longestGap).toBeLessThanOrEqual(1);
  });

  it("模型说不要铺底时也仍然有铺底，只是薄一些", () => {
    const brief = briefFor();
    const thin = developMusicIdea({ ...idea, padSustain: false }, brief, derivePitchMaterial(brief));
    const thick = developMusicIdea(idea, brief, derivePitchMaterial(brief));
    const padsOf = (plan: typeof thin.plan) => plan.events.filter((event) => event.voice === "pad");

    expect(padsOf(thin.plan).length).toBeGreaterThan(0);
    expect(Math.max(...padsOf(thin.plan).map((event) => event.velocity)))
      .toBeLessThan(Math.max(...padsOf(thick.plan).map((event) => event.velocity)));
  });

  it("不留下发不出声的和弦碎块", () => {
    const { plan } = develop();
    plan.events.filter((event) => event.voice === "pad").forEach((event) => {
      expect(event.durationSeconds).toBeGreaterThanOrEqual(1.2);
    });
  });
});

describe("开心与不开心要听得出来", () => {
  it("偏亮加大六度并抬高音区，偏暗加七度并压低音区", () => {
    const bright = develop({ valence: 0.8, arousal: 0 });
    const blue = develop({ valence: -0.8, arousal: 0 });
    const padNotes = (result: typeof bright) => result.plan.events.find((event) => event.voice === "pad")!.midiNotes;

    // 色彩音让和弦从三个音变成四个音。
    expect(padNotes(bright)).toHaveLength(4);
    expect(padNotes(blue)).toHaveLength(4);
    // 亮的整体更高。
    expect(Math.max(...padNotes(bright))).toBeGreaterThan(Math.max(...padNotes(blue)));
  });

  it("愉悦度中性时用朴素的三音和弦", () => {
    expect(develop({ valence: 0, arousal: 0 }).plan.events.find((event) => event.voice === "pad")!.midiNotes).toHaveLength(3);
  });

  it("同样的素材，开心与不开心的和声内容不同", () => {
    const bright = develop({ valence: 0.8, arousal: 0 }).plan.events.filter((event) => event.voice === "pad").map((event) => event.midiNotes.join(","));
    const blue = develop({ valence: -0.8, arousal: 0 }).plan.events.filter((event) => event.voice === "pad").map((event) => event.midiNotes.join(","));
    expect(bright).not.toEqual(blue);
  });
});

