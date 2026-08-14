export interface RecognitionProviderConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

/**
 * 服务端识别适配器的配置入口。当前阶段只建立边界，不猜测供应商协议；
 * 未完整配置时，产品继续使用浏览器本地模板读取。
 */
export function readRecognitionProviderConfig(): RecognitionProviderConfig | null {
  const apiKey = process.env.SOUND_CARD_RECOGNITION_API_KEY?.trim();
  const endpoint = process.env.SOUND_CARD_RECOGNITION_API_ENDPOINT?.trim();
  const model = process.env.SOUND_CARD_RECOGNITION_MODEL?.trim();
  if (!apiKey || !endpoint || !model) return null;
  return { apiKey, endpoint, model };
}
