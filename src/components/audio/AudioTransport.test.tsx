import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlaybackState } from "@/src/audio";
import { AudioTransport } from "./AudioTransport";

const state: PlaybackState = {
  status: "paused",
  currentTime: 6,
  duration: 24,
  activeSoundUnitIds: [],
  activeCompositionEventIds: [],
  polishEnabled: false,
  errorMessage: null,
};

describe("AudioTransport", () => {
  it("renders an accessible seek slider with the current playback position", () => {
    const html = renderToStaticMarkup(<AudioTransport state={state} onPlay={() => undefined} onPause={() => undefined} onSeek={() => undefined} />);

    expect(html).toContain('type="range"');
    expect(html).toContain('aria-label="播放进度"');
    expect(html).toContain('value="6"');
    expect(html).toContain('max="24"');
    expect(html).toContain('--transport-progress:25%');
  });

  it("disables seeking when no seek action is provided", () => {
    const html = renderToStaticMarkup(<AudioTransport state={state} onPlay={() => undefined} onPause={() => undefined} />);

    expect(html).toContain('type="range"');
    expect(html).toContain("disabled");
  });
});
