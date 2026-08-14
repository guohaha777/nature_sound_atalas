import type { PlaybackState } from "@/src/audio";

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function AudioTransport({ state, onPlay, onPause, compact = false }: { state: PlaybackState; onPlay: () => void; onPause: () => void; compact?: boolean }) {
  const playing = state.status === "playing";
  const loading = state.status === "loading";
  const percent = state.duration ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;
  return (
    <div className={`audio-transport ${compact ? "audio-transport--compact" : ""}`}>
      <button disabled={loading} className="audio-transport__button" onClick={playing ? onPause : onPlay} aria-label={playing ? "暂停" : loading ? "正在加载" : "播放"}>
        {playing ? <span className="pause-icon" /> : <span className="play-icon" />}
      </button>
      <div className="audio-transport__timeline">
        <div className="audio-transport__meta"><span>{playing ? "正在听见世界" : loading ? "正在加载原声" : state.status === "error" ? state.errorMessage ?? "播放失败" : state.status === "paused" ? "停在这里" : "准备播放"}</span><span>{formatTime(state.currentTime)} / {formatTime(state.duration)}</span></div>
        <div className="audio-transport__track"><span style={{ width: `${percent}%` }} /></div>
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
