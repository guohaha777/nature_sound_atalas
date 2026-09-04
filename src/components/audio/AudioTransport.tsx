import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { clampSeekSeconds, type PlaybackState } from "@/src/audio";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function AudioTransport({ state, onPlay, onPause, onSeek, compact = false }: { state: PlaybackState; onPlay: () => void; onPause: () => void; onSeek?: (seconds: number) => void | Promise<void>; compact?: boolean }) {
  const playing = state.status === "playing";
  const loading = state.status === "loading";
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [draftTime, setDraftTime] = useState(state.currentTime);
  const shownTime = dragging ? draftTime : state.currentTime;
  const percent = state.duration ? Math.min(100, (shownTime / state.duration) * 100) : 0;
  const disabled = !onSeek || loading || state.status === "error" || state.duration <= 0;
  const commitSeek = (seconds: number) => {
    draggingRef.current = false;
    setDragging(false);
    setDraftTime(seconds);
    void onSeek?.(seconds);
  };
  const pointerTime = (event: PointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.width > 0 ? (event.clientX - bounds.left) / bounds.width : 0;
    return clampSeekSeconds(ratio * state.duration, state.duration);
  };
  const handleSeekKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const step = Math.max(0.1, state.duration / 100);
    const keys: Record<string, number> = {
      ArrowLeft: -step,
      ArrowDown: -step,
      ArrowRight: step,
      ArrowUp: step,
      PageDown: -step * 10,
      PageUp: step * 10,
      Home: -state.duration,
      End: state.duration,
    };
    const delta = keys[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? state.duration : clampSeekSeconds(state.currentTime + delta, state.duration);
    setDraftTime(next);
    void onSeek?.(next);
  };
  return (
    <div className={`audio-transport ${compact ? "audio-transport--compact" : ""}`}>
      <button disabled={loading} className="audio-transport__button" onClick={playing ? onPause : onPlay} aria-label={playing ? "暂停" : loading ? "正在加载" : "播放"}>
        {playing ? <span className="pause-icon" /> : <span className="play-icon" />}
      </button>
      <div className="audio-transport__timeline">
        <div className="audio-transport__meta"><span>{dragging ? "松开后从这里继续" : playing ? "正在听见世界" : loading ? "正在加载原声" : state.status === "error" ? state.errorMessage ?? "播放失败" : state.status === "paused" ? "停在这里" : state.status === "ended" ? "已经听完" : "准备播放"}</span><span>{formatTime(shownTime)} / {formatTime(state.duration)}</span></div>
        <input
          className="audio-transport__track"
          type="range"
          min={0}
          max={Math.max(0, state.duration)}
          step={0.1}
          value={Math.min(shownTime, state.duration || 0)}
          disabled={disabled}
          aria-label="播放进度"
          aria-valuetext={`${formatTime(shownTime)}，共 ${formatTime(state.duration)}`}
          style={{ "--transport-progress": `${percent}%` } as React.CSSProperties}
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            const seconds = pointerTime(event);
            setDragging(true);
            setDraftTime(seconds);
          }}
          onPointerMove={(event) => { if (draggingRef.current) setDraftTime(pointerTime(event)); }}
          onPointerUp={(event) => commitSeek(pointerTime(event))}
          onPointerCancel={() => commitSeek(draftTime)}
          onChange={(event) => {
            const seconds = Number(event.currentTarget.value);
            setDraftTime(seconds);
            if (draggingRef.current) setDragging(true);
            else void onSeek?.(seconds);
          }}
          onKeyDown={handleSeekKey}
          onBlur={(event) => { if (draggingRef.current) commitSeek(Number(event.currentTarget.value)); }}
        />
      </div>
    </div>
  );
}

export function LayerToggle({ enabled, disabled, onChange }: { enabled: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className={`layer-toggle ${disabled ? "is-disabled" : ""}`} aria-label="声音层切换">
      <button className={!enabled ? "is-selected" : ""} onClick={() => onChange(false)}>只听原声</button>
      <button disabled={disabled} className={enabled ? "is-selected" : ""} onClick={() => onChange(true)}>原声 + AI 背景</button>
    </div>
  );
}
