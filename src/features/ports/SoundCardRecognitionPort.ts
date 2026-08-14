import type {
  ContourChoice,
  DurationChoice,
  IntensityChoice,
  PatternChoice,
  PitchChoice,
} from "@/src/domain/sound-card";

/**
 * 外部纸卡识别服务的稳定边界。具体供应商、请求字段和鉴权方式需在用户提供 API 文档后实现，
 * 避免前端页面绑定某一家模型，也避免把密钥发送到浏览器。
 */
export interface SoundCardRecognitionPort {
  recognize(input: { imageAssetId: string; entryIndex: 0 | 1 | 2 }): Promise<{
    sourceCandidates: string[];
    pitch: PitchChoice | null;
    duration: DurationChoice | null;
    contour: ContourChoice | null;
    intensity: IntensityChoice | null;
    pattern: PatternChoice | null;
    score: number | null;
    reason: string;
    provider: string;
    model: string | null;
  }>;
}
