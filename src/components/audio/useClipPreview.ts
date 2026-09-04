"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 选区试听：只播放当前选择的一段，不改变原始音频。 */
export function useClipPreview(url: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const toggle = useCallback(async (range: { startSeconds: number; endSeconds: number }) => {
    if (playing) {
      stop();
      return;
    }
    const audio = new Audio(url);
    audio.currentTime = range.startSeconds;
    audioRef.current = audio;
    try {
      await audio.play();
      setPlaying(true);
      timerRef.current = window.setInterval(() => {
        if (audio.currentTime >= range.endSeconds || audio.ended) stop();
      }, 40);
    } catch {
      stop();
    }
  }, [playing, stop, url]);

  return { playing, toggle, stop };
}
