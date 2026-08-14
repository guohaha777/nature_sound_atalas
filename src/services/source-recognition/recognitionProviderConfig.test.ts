import { afterEach, describe, expect, it } from "vitest";
import { readRecognitionProviderConfig } from "./recognitionProviderConfig";

const original = {
  key: process.env.SOUND_CARD_RECOGNITION_API_KEY,
  endpoint: process.env.SOUND_CARD_RECOGNITION_API_ENDPOINT,
  model: process.env.SOUND_CARD_RECOGNITION_MODEL,
};

afterEach(() => {
  restore("SOUND_CARD_RECOGNITION_API_KEY", original.key);
  restore("SOUND_CARD_RECOGNITION_API_ENDPOINT", original.endpoint);
  restore("SOUND_CARD_RECOGNITION_MODEL", original.model);
});

describe("readRecognitionProviderConfig", () => {
  it("keeps the local fallback active when the remote provider is incomplete", () => {
    process.env.SOUND_CARD_RECOGNITION_API_KEY = "key";
    delete process.env.SOUND_CARD_RECOGNITION_API_ENDPOINT;
    process.env.SOUND_CARD_RECOGNITION_MODEL = "model";
    expect(readRecognitionProviderConfig()).toBeNull();
  });

  it("returns server-side configuration only when all values exist", () => {
    process.env.SOUND_CARD_RECOGNITION_API_KEY = "key";
    process.env.SOUND_CARD_RECOGNITION_API_ENDPOINT = "https://provider.example/recognize";
    process.env.SOUND_CARD_RECOGNITION_MODEL = "model";
    expect(readRecognitionProviderConfig()).toEqual({
      apiKey: "key",
      endpoint: "https://provider.example/recognize",
      model: "model",
    });
  });
});

function restore(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
