import type { ContourChoice, DurationChoice, IntensityChoice, PatternChoice, PitchChoice } from "@/src/domain/sound-card";

export interface ReadPaperCardEntry {
  entryIndex: 0 | 1 | 2;
  filled: boolean;
  sourceInkRatio: number;
  pitch: PitchChoice | null;
  duration: DurationChoice | null;
  contour: ContourChoice | null;
  intensity: IntensityChoice | null;
  pattern: PatternChoice | null;
  confidence: "high" | "review";
}

type Box = readonly [number, number, number, number];

const SINGLE_LAYOUT = {
  source: [0.075, 0.175, 0.91, 0.35] as Box,
  pitch: { y: [0.43, 0.502] as const, count: 3, values: ["high", "mid", "low"] as const },
  duration: { y: [0.548, 0.62] as const, count: 3, values: ["short", "medium", "long"] as const },
  contour: { y: [0.664, 0.735] as const, count: 4, values: ["rising", "falling", "flat", "wavy"] as const },
  intensity: { y: [0.775, 0.847] as const, count: 3, values: ["soft", "medium", "loud"] as const },
  pattern: { y: [0.898, 0.97] as const, count: 4, values: ["once", "repeat", "bursts", "fade-in"] as const },
};

/** 固定模板 V1：单卡直接读取；横向整张纸先等分三栏，仅保留来源框内有手写痕迹的栏。 */
export async function readPaperSoundCardV1(blob: Blob): Promise<ReadPaperCardEntry[]> {
  const bitmap = await createImageBitmap(blob);
  const columnCount = bitmap.width / bitmap.height > 1.25 ? 3 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const columnWidth = canvas.width / columnCount;
  return Array.from({ length: columnCount }, (_, index) => {
    const offsetX = columnWidth * index;
    const sourceInkRatio = darkInkRatio(context, offsetX, 0, columnWidth, canvas.height, SINGLE_LAYOUT.source);
    const filled = sourceInkRatio > 0.0022;
    if (!filled) return emptyEntry(index, sourceInkRatio);

    const pitch = choose(context, offsetX, columnWidth, canvas.height, SINGLE_LAYOUT.pitch);
    const duration = choose(context, offsetX, columnWidth, canvas.height, SINGLE_LAYOUT.duration);
    const contour = choose(context, offsetX, columnWidth, canvas.height, SINGLE_LAYOUT.contour);
    const intensity = choose(context, offsetX, columnWidth, canvas.height, SINGLE_LAYOUT.intensity);
    const pattern = choose(context, offsetX, columnWidth, canvas.height, SINGLE_LAYOUT.pattern);
    const selections = [pitch, duration, contour, intensity, pattern];
    return {
      entryIndex: index as 0 | 1 | 2,
      filled,
      sourceInkRatio,
      pitch: pitch.value,
      duration: duration.value,
      contour: contour.value,
      intensity: intensity.value,
      pattern: pattern.value,
      confidence: selections.every((item) => item.confident) ? "high" : "review",
    };
  });
}

function emptyEntry(index: number, sourceInkRatio: number): ReadPaperCardEntry {
  return { entryIndex: index as 0 | 1 | 2, filled: false, sourceInkRatio, pitch: null, duration: null, contour: null, intensity: null, pattern: null, confidence: "review" };
}

function choose<T extends string>(context: CanvasRenderingContext2D, offsetX: number, width: number, height: number, row: { y: readonly [number, number]; count: number; values: readonly T[] }) {
  const scores = row.values.map((value, index) => ({ value, score: optionRingScore(context, offsetX, width, height, row.y, row.count, index) })).sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1];
  return { value: best?.value ?? null, confident: Boolean(best && second && best.score > second.score * 1.12 && best.score - second.score > 0.001) };
}

function optionRingScore(context: CanvasRenderingContext2D, offsetX: number, width: number, height: number, y: readonly [number, number], count: number, index: number) {
  const gap = width * 0.012;
  const outerMargin = width * 0.055;
  const usable = width - outerMargin * 2;
  const cellWidth = (usable - gap * (count - 1)) / count;
  const x = offsetX + outerMargin + index * (cellWidth + gap);
  const top = height * y[0];
  const cellHeight = height * (y[1] - y[0]);
  const data = context.getImageData(Math.round(x), Math.round(top), Math.max(1, Math.round(cellWidth)), Math.max(1, Math.round(cellHeight)));
  let ink = 0;
  let sampled = 0;
  for (let py = 0; py < data.height; py += 2) {
    for (let px = 0; px < data.width; px += 2) {
      const nx = px / data.width;
      const ny = py / data.height;
      const inRing = nx < 0.25 || nx > 0.75 || ny < 0.28 || (ny > 0.58 && ny < 0.78);
      const awayFromBorder = nx > 0.035 && nx < 0.965 && ny > 0.05 && ny < 0.94;
      if (!inRing || !awayFromBorder) continue;
      const at = (py * data.width + px) * 4;
      const luminance = data.data[at] * 0.299 + data.data[at + 1] * 0.587 + data.data[at + 2] * 0.114;
      if (luminance < 90) ink++;
      sampled++;
    }
  }
  return sampled ? ink / sampled : 0;
}

function darkInkRatio(context: CanvasRenderingContext2D, offsetX: number, offsetY: number, width: number, height: number, box: Box) {
  const x = Math.round(offsetX + width * box[0]);
  const y = Math.round(offsetY + height * box[1]);
  const w = Math.max(1, Math.round(width * (box[2] - box[0])));
  const h = Math.max(1, Math.round(height * (box[3] - box[1])));
  const data = context.getImageData(x, y, w, h);
  let dark = 0;
  let sampled = 0;
  for (let py = 0; py < h; py += 3) {
    for (let px = 0; px < w; px += 3) {
      const at = (py * w + px) * 4;
      const luminance = data.data[at] * 0.299 + data.data[at + 1] * 0.587 + data.data[at + 2] * 0.114;
      if (luminance < 90) dark++;
      sampled++;
    }
  }
  return sampled ? dark / sampled : 0;
}
