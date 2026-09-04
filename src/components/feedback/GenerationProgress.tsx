"use client";

import { useEffect, useState } from "react";
import { expectedGenerationSeconds, readGenerationProgress } from "@/src/features/music-polish";

interface GenerationProgressProps {
  /** 当前作品时长；越长音符越多，等待也越久。 */
  compositionDurationSeconds: number;
  title: string;
}

/**
 * 背景生成期间的等待反馈：一条只增不减的进度条 + 分阶段说明。
 * 进度是按等待时间估算的，不谎报"已完成"，拿到结果时由调用方直接关闭。
 */
export function GenerationProgress({ compositionDurationSeconds, title }: GenerationProgressProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const expectedSeconds = expectedGenerationSeconds(compositionDurationSeconds);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 400);
    return () => window.clearInterval(timer);
  }, []);

  const progress = readGenerationProgress(elapsedMs, expectedSeconds);

  return <section className="generation-progress" role="status" aria-live="polite">
    <span>CREATING / 正在生成</span>
    <h2>{title}</h2>
    <div className="generation-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="背景生成进度">
      <i style={{ width: `${progress.percent}%` }} />
    </div>
    <p className="generation-progress__stage">{progress.message}</p>
    <p className="generation-progress__meta">已等待 {Math.round(elapsedMs / 1000)} 秒 · 通常约 {expectedSeconds} 秒{progress.hint ? ` · ${progress.hint}` : ""}</p>
  </section>;
}
