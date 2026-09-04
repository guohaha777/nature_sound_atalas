"use client";

import { useCallback, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

export interface AudioRange {
  startSeconds: number;
  endSeconds: number;
}

interface AudioRangeSelectorProps {
  sourceDurationSeconds: number;
  value: AudioRange;
  waveform: number[];
  minSelectionSeconds: number;
  /** 录入阶段用于限制单个音源长度；声场编辑不传时不限制。 */
  maxSelectionSeconds?: number;
  onChange(value: AudioRange): void;
  onInteractionStart?(): void;
}

const KEYBOARD_STEP_SECONDS = 0.25;
const KEYBOARD_LARGE_STEP_SECONDS = 1;

/**
 * 完整原声轨道 + 左右两个手柄。手柄可以直接拖动，也可以用方向键微调，
 * 因此不再重复一组开始/结束滑块；当前秒数由弹窗顶部的数字显示。
 */
export function AudioRangeSelector({ sourceDurationSeconds, value, waveform, minSelectionSeconds, maxSelectionSeconds, onChange, onInteractionStart }: AudioRangeSelectorProps) {
  const source = Math.max(minSelectionSeconds, sourceDurationSeconds);
  const durationSeconds = Math.max(minSelectionSeconds, value.endSeconds - value.startSeconds);
  const startPercent = value.startSeconds / source * 100;
  const widthPercent = durationSeconds / source * 100;

  const commit = useCallback((handle: "start" | "end", seconds: number) => {
    onInteractionStart?.();
    const limit = maxSelectionSeconds ?? source;
    if (handle === "start") {
      const startSeconds = clamp(seconds, Math.max(0, value.endSeconds - limit), value.endSeconds - minSelectionSeconds);
      onChange({ startSeconds: round(startSeconds), endSeconds: round(value.endSeconds) });
      return;
    }
    const endSeconds = clamp(seconds, value.startSeconds + minSelectionSeconds, Math.min(source, value.startSeconds + limit));
    onChange({ startSeconds: round(value.startSeconds), endSeconds: round(endSeconds) });
  }, [maxSelectionSeconds, minSelectionSeconds, onChange, onInteractionStart, source, value.endSeconds, value.startSeconds]);

  // 手柄的父元素就是轨道，直接量它的宽度，避免在渲染期读取 ref。
  const secondsFromPointer = (handle: HTMLElement, clientX: number) => {
    const rect = handle.parentElement?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return clamp((clientX - rect.left) / rect.width, 0, 1) * source;
  };

  const handleProps = (handle: "start" | "end") => {
    const current = handle === "start" ? value.startSeconds : value.endSeconds;
    return {
      role: "slider",
      tabIndex: 0,
      "aria-label": handle === "start" ? "选区开始位置，可拖动或用左右方向键调整" : "选区结束位置，可拖动或用左右方向键调整",
      "aria-valuemin": 0,
      "aria-valuemax": Number(source.toFixed(2)),
      "aria-valuenow": Number(current.toFixed(2)),
      "aria-valuetext": `${current.toFixed(1)} 秒`,
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        onInteractionStart?.();
      },
      onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const seconds = secondsFromPointer(event.currentTarget, event.clientX);
        if (seconds !== null) commit(handle, seconds);
      },
      onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => event.currentTarget.releasePointerCapture(event.pointerId),
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        const step = event.shiftKey ? KEYBOARD_LARGE_STEP_SECONDS : KEYBOARD_STEP_SECONDS;
        const delta = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        if (delta === 0) return;
        event.preventDefault();
        commit(handle, current + delta);
      },
    };
  };

  return <div className="clip-range">
    <div className="clip-editor__track">
      <div className="clip-editor__waveform" aria-hidden="true">
        {waveform.map((height, index) => <i style={{ height: `${Math.max(8, height * 100)}%` }} key={index} />)}
      </div>
      <div className="clip-editor__selected" style={{ left: `${startPercent}%`, width: `${widthPercent}%` }} aria-hidden="true" />
      <button className="clip-editor__handle clip-editor__handle--start" style={{ left: `${startPercent}%` }} {...handleProps("start")}><span aria-hidden="true" /></button>
      <button className="clip-editor__handle clip-editor__handle--end" style={{ left: `${startPercent + widthPercent}%` }} {...handleProps("end")}><span aria-hidden="true" /></button>
    </div>
    <p className="clip-range__hint">拖动轨道上的两个手柄选择要保留的一段（也可以点中手柄后按左右方向键微调）。</p>
  </div>;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function round(value: number) {
  return Number(value.toFixed(3));
}
