"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { OriginalAudioAsset } from "@/src/domain/audio-asset";
import type { CompositionEvent } from "@/src/domain/composition";
import { evaluateClipCapacity, MIN_SOURCE_CLIP_SECONDS, readEventSourceClip } from "@/src/features/sound-world";
import { AudioRangeSelector, type AudioRange } from "./AudioRangeSelector";
import { useAudioWaveform } from "./useAudioWaveform";
import { useClipPreview } from "./useClipPreview";

interface AudioClipEditorProps {
  event: CompositionEvent;
  asset: OriginalAudioAsset;
  playbackUrl: string;
  title: string;
  color: string;
  compositionDurationSeconds: number;
  onClose(): void;
  onSave(selection: AudioRange, options?: { expandWorkToFit?: boolean }): void;
}

export function AudioClipEditor({ event, asset, playbackUrl, title, color, compositionDurationSeconds, onClose, onSave }: AudioClipEditorProps) {
  const initial = useMemo(() => readEventSourceClip(event, asset), [asset, event]);
  const [range, setRange] = useState<AudioRange>({ startSeconds: initial.startSeconds, endSeconds: initial.endSeconds });
  const waveform = useAudioWaveform(playbackUrl);
  const preview = useClipPreview(playbackUrl);
  const durationSeconds = Math.max(MIN_SOURCE_CLIP_SECONDS, range.endSeconds - range.startSeconds);
  const capacity = evaluateClipCapacity(durationSeconds, compositionDurationSeconds);

  useEffect(() => {
    const closeOnEscape = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      preview.stop();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, preview]);

  const close = () => { preview.stop(); onClose(); };
  const save = (expandWorkToFit: boolean) => { preview.stop(); onSave(range, { expandWorkToFit }); };
  const resetFullSource = () => {
    preview.stop();
    setRange({ startSeconds: 0, endSeconds: initial.sourceDurationSeconds });
  };

  return <div className="clip-editor-backdrop" role="presentation">
    <section className="clip-editor" role="dialog" aria-modal="true" aria-labelledby="clip-editor-title" style={{ "--clip-color": color } as CSSProperties}>
      <header className="clip-editor__header">
        <div><span>SOURCE CLIP / 原声片段</span><h2 id="clip-editor-title">选择“{title}”播放哪一段</h2><p>原始素材保持不变；这里只决定这个声音胶囊使用的开始位置和长度。拖动轨道上的左右手柄即可。</p></div>
        <button onClick={close} aria-label="关闭声音片段编辑">×</button>
      </header>

      <p className="clip-editor__summary" role="status">原声 {formatSeconds(initial.sourceDurationSeconds)} / 当前使用 {formatSeconds(durationSeconds)}</p>

      <div className="clip-editor__facts">
        <span><small>可用原声</small><strong>{formatSeconds(initial.sourceDurationSeconds)}</strong></span>
        <span><small>开始位置</small><strong>{formatSeconds(range.startSeconds)}</strong></span>
        <span><small>当前使用</small><strong>{formatSeconds(durationSeconds)}</strong></span>
        <span><small>结束位置</small><strong>{formatSeconds(range.endSeconds)}</strong></span>
      </div>

      <AudioRangeSelector
        sourceDurationSeconds={initial.sourceDurationSeconds}
        value={range}
        waveform={waveform}
        minSelectionSeconds={MIN_SOURCE_CLIP_SECONDS}
        onChange={setRange}
        onInteractionStart={preview.stop}
      />

      {initial.limitedByIngestPolicy && <p className="clip-editor__limit" role="note">原文件超过 30 秒；按照项目录入规则，本次只使用前 30 秒。</p>}

      {!capacity.fits && <div className="clip-editor__capacity" role="note">
        <strong>这段声音比当前作品还长</strong>
        <p>选区 {formatSeconds(durationSeconds)}，当前作品只有约 {Math.round(capacity.compositionDurationSeconds)} 秒。系统不会悄悄剪短它：{capacity.suggestedDurationSeconds ? `可以把作品换成约 ${capacity.suggestedDurationSeconds} 秒，或把选区缩短到 ${formatSeconds(capacity.maxSelectionSecondsInCurrentWork)} 以内。` : `请把选区缩短到 ${formatSeconds(capacity.maxSelectionSecondsInCurrentWork)} 以内。`}</p>
        {capacity.suggestedDurationSeconds && <button onClick={() => save(true)}>换成约 {capacity.suggestedDurationSeconds} 秒作品并保留完整这段</button>}
      </div>}

      <footer className="clip-editor__actions">
        <button onClick={resetFullSource}>恢复完整原声</button>
        <button onClick={() => void preview.toggle(range)}>{preview.playing ? "■ 停止试听" : "▶ 试听当前选区"}</button>
        <button className="is-primary" disabled={!capacity.fits} onClick={() => save(false)}>使用这段声音</button>
      </footer>
    </section>
  </div>;
}

function formatSeconds(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)} 秒`;
}
