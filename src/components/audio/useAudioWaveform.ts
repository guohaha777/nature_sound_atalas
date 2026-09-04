"use client";

import { useEffect, useState } from "react";

/**
 * 只用于显示完整原声轨道；解码失败时保留中性波形，选区与试听仍可使用。
 */
export function useAudioWaveform(url: string, barCount = 96) {
  const [waveform, setWaveform] = useState(() => neutralWaveform(barCount));
  useEffect(() => {
    const controller = new AbortController();
    let context: AudioContext | null = null;
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
        context = new AudioContext();
        const decoded = await context.decodeAudioData(buffer.slice(0));
        const channel = decoded.getChannelData(0);
        const bucketSize = Math.max(1, Math.floor(channel.length / barCount));
        const amplitudes = Array.from({ length: barCount }, (_, bucket) => {
          const start = bucket * bucketSize;
          const end = Math.min(channel.length, start + bucketSize);
          let peak = 0;
          for (let index = start; index < end; index += Math.max(1, Math.floor(bucketSize / 80))) peak = Math.max(peak, Math.abs(channel[index]));
          return peak;
        });
        const maximum = Math.max(0.001, ...amplitudes);
        if (!controller.signal.aborted) setWaveform(amplitudes.map((value) => Math.max(0.06, value / maximum)));
      } catch {
        // 保留中性轨道。
      } finally {
        void context?.close();
      }
    })();
    return () => controller.abort();
  }, [barCount, url]);
  return waveform;
}

function neutralWaveform(barCount: number) {
  return Array.from({ length: barCount }, (_, index) => 0.18 + (index % 7) * 0.045);
}
