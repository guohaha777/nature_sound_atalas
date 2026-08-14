"use client";

import { useState } from "react";
import { PageShell } from "@/src/components/navigation";
import { useExperience } from "@/src/app";
import { startPageTransition, usePageRouter } from "@/src/features/page-transition";
import { buildHomeEntryRoute } from "@/src/features/start-demo/buildHomeEntryRoute";
import { HOME_PAGE_MOCK, type HomeEntranceId, type HomeEntrySource } from "@/src/mocks/homePageMockData";
import { ForestScene } from "./ForestScene";
import { HomeEntrance } from "./HomeEntrance";
import { HomeEntryDialog } from "./HomeEntryDialog";

export function HomePage() {
  const router = usePageRouter();
  const { startDemo, savePendingCardImage, completedSteps, resumePath, hydrated } = useExperience();
  const [activeEntry, setActiveEntry] = useState<HomeEntranceId | null>(null);
  const canResume = hydrated && completedSteps.length > 0 && resumePath !== "/";
  const begin = async (source: HomeEntrySource, file?: File) => {
    if (!activeEntry) return;
    if (activeEntry === "diary" && (!file || (source !== "camera" && source !== "upload"))) return;
    startPageTransition();
    await startDemo();
    if (activeEntry === "diary") {
      if (!file || (source !== "camera" && source !== "upload")) return;
      await savePendingCardImage(file, source);
    }
    router.push(buildHomeEntryRoute(activeEntry, source));
  };

  return (
    <PageShell tone="forest" showSteps={false} headerMeta={HOME_PAGE_MOCK.headerMeta} headerAside={HOME_PAGE_MOCK.headerAside}>
      <section className="forest-home" aria-labelledby="forest-home-title">
        <ForestScene />
        <div className="forest-home__copy">
          <p className="forest-home__eyebrow">TODAY YOU HEARD —</p>
          <h1 id="forest-home-title">今天，<br />你听见了<br />什么？</h1>
          <div className="forest-home__entrances" aria-label="开始一次声音创作">
            {HOME_PAGE_MOCK.entrances.map((entrance) => (
              <HomeEntrance
                entrance={entrance}
                onSelect={() => setActiveEntry(entrance.id)}
                key={entrance.id}
              />
            ))}
          </div>
          {canResume && (
            <button className="forest-home__resume" type="button" onClick={() => router.push(resumePath)}>
              <span>继续上次创作</span><small>从已保存的进度返回</small><b aria-hidden="true">→</b>
            </button>
          )}
          <p className="forest-home__lead">孩子从真实世界开始：听见、在纸上记录、让声音变成音乐，再和其他孩子的声音相遇。</p>
        </div>
        <footer className="forest-home__footer"><span>听见世界 → 记录 → 变成声音 → 相遇 → 成曲</span><span>EST. 2026</span></footer>
        {activeEntry && <HomeEntryDialog entry={activeEntry} onClose={() => setActiveEntry(null)} onContinue={begin} />}
      </section>
    </PageShell>
  );
}
