"use client";

import { useEffect, useState } from "react";
import { createIdleLevels, pushLevel, readFrameLevel, RECORDING_LEVEL_BAR_COUNT } from "@/src/features/recording";

interface LiveWaveformProps {
  /** 正在录音的音频流；为 null 时波形静止。 */
  stream: MediaStream | null;
  /** 录完后展示的静态波形（保留最后一次录音的形状）。 */
  frozenLevels?: number[];
}

/**
 * 录音时按真实麦克风音量跳动的波形，让老师一眼看出"正在收音"。
 * 只读取音量，不保存任何音频数据。
 */
export function LiveWaveform({ stream, frozenLevels }: LiveWaveformProps) {
  const [levels, setLevels] = useState<number[]>(() => createIdleLevels());

  useEffect(() => {
    if (!stream) return;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    const read = () => {
      analyser.getFloatTimeDomainData(samples);
      setLevels((current) => pushLevel(current, readFrameLevel(samples)));
      frame = window.setTimeout(read, 60);
    };
    read();
    return () => {
      window.clearTimeout(frame);
      source.disconnect();
      void context.close();
    };
  }, [stream]);

  const shown = stream ? levels : frozenLevels?.length ? frozenLevels : levels;

  return <div className={`live-wave ${stream ? "is-listening" : ""}`} aria-hidden="true">
    {Array.from({ length: RECORDING_LEVEL_BAR_COUNT }, (_, index) => (
      <i style={{ height: `${8 + (shown[index] ?? 0) * 84}%` }} key={index} />
    ))}
  </div>;
}
