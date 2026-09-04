"use client";

import { useEffect, useState } from "react";
import { clampIngestSelection, MAX_INGEST_DURATION_SECONDS, MIN_INGEST_DURATION_SECONDS } from "@/src/features/recording";
import { AudioRangeSelector, type AudioRange } from "./AudioRangeSelector";
import { useAudioWaveform } from "./useAudioWaveform";
import { useClipPreview } from "./useClipPreview";

interface AudioTrimDialogProps {
  fileName: string;
  playbackUrl: string;
  sourceDurationSeconds: number;
  defaultSelection: AudioRange;
  busy?: boolean;
  onCancel(): void;
  onConfirm(selection: AudioRange): void;
}

/**
 * 上传音频超过单个音源上限时的必经步骤：先由用户截取一段，再保存进声音库。
 */
export function AudioTrimDialog({ fileName, playbackUrl, sourceDurationSeconds, defaultSelection, busy, onCancel, onConfirm }: AudioTrimDialogProps) {
  const [range, setRange] = useState<AudioRange>(() => clampIngestSelection(defaultSelection, sourceDurationSeconds));
  const waveform = useAudioWaveform(playbackUrl);
  const preview = useClipPreview(playbackUrl);
  const durationSeconds = range.endSeconds - range.startSeconds;

  useEffect(() => {
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape" || busy) return;
      preview.stop();
      onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel, preview]);

  return <div className="clip-editor-backdrop" role="presentation">
    <section className="clip-editor" role="dialog" aria-modal="true" aria-labelledby="audio-trim-title">
      <header className="clip-editor__header">
        <div><span>UPLOAD TRIM / 上传截取</span><h2 id="audio-trim-title">先截取要保留的一段</h2><p>{fileName} 共 {formatSeconds(sourceDurationSeconds)}，超过单个音源 {MAX_INGEST_DURATION_SECONDS} 秒的上限。拖动左右手柄选择保留哪一段，保存后这一段就是这个声音的完整原声。</p></div>
        <button onClick={() => { preview.stop(); onCancel(); }} disabled={busy} aria-label="取消上传截取">×</button>
      </header>

      <p className="clip-editor__summary" role="status">原文件 {formatSeconds(sourceDurationSeconds)} / 将保存 {formatSeconds(durationSeconds)}</p>

      <div className="clip-editor__facts">
        <span><small>原文件长度</small><strong>{formatSeconds(sourceDurationSeconds)}</strong></span>
        <span><small>开始位置</small><strong>{formatSeconds(range.startSeconds)}</strong></span>
        <span><small>将保存</small><strong>{formatSeconds(durationSeconds)}</strong></span>
        <span><small>上限</small><strong>{MAX_INGEST_DURATION_SECONDS} 秒</strong></span>
      </div>

      <AudioRangeSelector
        sourceDurationSeconds={sourceDurationSeconds}
        value={range}
        waveform={waveform}
        minSelectionSeconds={MIN_INGEST_DURATION_SECONDS}
        maxSelectionSeconds={MAX_INGEST_DURATION_SECONDS}
        onChange={(next) => setRange(clampIngestSelection(next, sourceDurationSeconds))}
        onInteractionStart={preview.stop}
      />

      <footer className="clip-editor__actions">
        <button onClick={() => { preview.stop(); onCancel(); }} disabled={busy}>换一个文件</button>
        <button onClick={() => void preview.toggle(range)} disabled={busy}>{preview.playing ? "■ 停止试听" : "▶ 试听当前选区"}</button>
        <button className="is-primary" disabled={busy} onClick={() => { preview.stop(); onConfirm(range); }}>{busy ? "正在截取…" : "使用这一段"}</button>
      </footer>
    </section>
  </div>;
}

function formatSeconds(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)} 秒`;
}
