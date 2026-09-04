import { describe, expect, it } from "vitest";
import type { PrerenderedClip } from "./contracts";
import { DEFAULT_EMOTION, selectPrerenderedClip } from "./selectPrerenderedClip";

function clip(overrides: Partial<PrerenderedClip> = {}): PrerenderedClip {
  const base: PrerenderedClip = {
    id: "content-quiet-20s-1",
    url: "/backgrounds/content-quiet-20s-1.mp3",
    emotion: "content",
    density: "quiet",
    durationSeconds: 20,
    variant: 1,
    actualDurationSeconds: 20,
    seed: 1021,
  };
  return { ...base, ...overrides };
}

const query = { emotion: "content", density: "quiet", durationSeconds: 20, seed: "seed-a" } as const;

describe("selectPrerenderedClip", () => {
  it("按情绪、密度和时长选中对应素材", () => {
    const wanted = clip();
    const pool = [clip({ id: "blue-quiet-20s-1", emotion: "blue" }), wanted, clip({ id: "content-driving-20s-1", density: "driving" })];
    expect(selectPrerenderedClip(pool, query)?.id).toBe(wanted.id);
  });

  it("儿童没有选情绪时使用默认情绪，而不是随便挑一条", () => {
    const pool = [clip({ id: "blue-quiet-20s-1", emotion: "blue" }), clip({ id: "default-hit" , emotion: DEFAULT_EMOTION })];
    expect(selectPrerenderedClip(pool, { ...query, emotion: null })?.id).toBe("default-hit");
  });

  it("同一作品重复挑选结果不变，保存后重放听到的是同一条", () => {
    const pool = [clip({ id: "a", variant: 1 }), clip({ id: "b", variant: 2 }), clip({ id: "c", variant: 3 })];
    const first = selectPrerenderedClip(pool, query);
    expect(selectPrerenderedClip(pool, query)?.id).toBe(first?.id);
    expect(selectPrerenderedClip([...pool].reverse(), query)?.id).toBe(first?.id);
  });

  it("不同作品会用到不同备选，素材库不会只有一条被反复使用", () => {
    const pool = [clip({ id: "a", variant: 1 }), clip({ id: "b", variant: 2 }), clip({ id: "c", variant: 3 })];
    const picked = new Set(
      ["s1", "s2", "s3", "s4", "s5", "s6"].map((seed) => selectPrerenderedClip(pool, { ...query, seed })?.id),
    );
    expect(picked.size).toBeGreaterThan(1);
  });

  it("拒绝比作品短的素材，宁可没有背景也不放一段铺不满的", () => {
    const pool = [clip({ actualDurationSeconds: 12 })];
    expect(selectPrerenderedClip(pool, { ...query, durationSeconds: 30 })).toBeNull();
  });

  it("没有正好时长的素材时用更长的裁，且取最接近的那一档", () => {
    const pool = [
      clip({ id: "long-45", durationSeconds: 45, actualDurationSeconds: 45 }),
      clip({ id: "long-30", durationSeconds: 30, actualDurationSeconds: 30 }),
    ];
    expect(selectPrerenderedClip(pool, { ...query, durationSeconds: 20 })?.id).toBe("long-30");
  });

  it("素材库里没有这一组合时返回 null，由调用方决定降级", () => {
    expect(selectPrerenderedClip([clip({ emotion: "tense" })], query)).toBeNull();
    expect(selectPrerenderedClip([], query)).toBeNull();
  });
});
