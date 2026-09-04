"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- vinext beta's client Link runtime currently throws in production; static shell navigation must retain a reliable hard-navigation fallback. */

import type { ReactNode } from "react";

const STEPS = [
  { href: "/", zh: "声音入口", en: "ENTRANCE" },
  { href: "/cards?entry=diary", zh: "采集与转译", en: "CAPTURE" },
  { href: "/cards/cow/confirm?entry=record&source=library", zh: "声音诞生", en: "BIRTH" },
  { href: "/world", zh: "万物声场", en: "SOUND FIELD" },
  { href: "/compose", zh: "让万物成曲", en: "COMPOSE" },
] as const;

interface PageShellProps {
  children: ReactNode;
  tone?: "paper" | "forest";
  showSteps?: boolean;
  headerMeta?: ReactNode;
  headerAside?: ReactNode;
  step?: 1 | 2 | 3 | 4 | 5;
  title?: string;
  subtitle?: string;
}

export function PageShell({
  children,
  tone = "paper",
  showSteps = true,
  headerMeta,
  headerAside,
  step,
  title,
  subtitle,
}: PageShellProps) {
  const current = STEPS[(step ?? 1) - 1];

  return (
    <main className={`page-shell page-shell--${tone} atlas-shell`}>
      <header className="atlas-topbar">
        <a href="/" className="atlas-brand" aria-label="返回万物声谱首页">
          <span className="atlas-brand__mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 14c0-4 3-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M8 12v4M12 10v7M16 12v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span>万物声谱</span>
        </a>
        <p className="atlas-topbar__meta">
          {headerMeta ?? (showSteps && step ? `SOUND ATLAS · ${current.en} — 用纸记录世界的声音，让它成为集体音乐` : "SOUND ATLAS · 2026")}
        </p>
        <div className="atlas-topbar__aside">
          <span className="atlas-index">{String(step ?? 1).padStart(2, "0")} / 05</span>
          <span>{headerAside ?? "关于"}</span>
        </div>
      </header>

      {showSteps && step ? (
        <div className="atlas-layout">
          <aside className="atlas-rail" aria-label="体验步骤">
            <nav>
              {STEPS.map((item, index) => {
                const number = index + 1;
                const state = number === step ? "current" : number < step ? "done" : "todo";
                return (
                  <a className={`atlas-step atlas-step--${state}`} href={item.href} key={item.en}>
                    <span className="atlas-step__number">{String(number).padStart(2, "0")}</span>
                    <span><strong>{item.zh}</strong><small>{item.en}</small></span>
                  </a>
                );
              })}
            </nav>
          </aside>

          <section className="atlas-main">
            <nav className="atlas-mobile-steps" aria-label="体验步骤">
              {STEPS.map((item, index) => (
                <a className={index + 1 === step ? "is-current" : ""} href={item.href} key={item.en}>
                  <span>{String(index + 1).padStart(2, "0")}</span>{item.zh}
                </a>
              ))}
            </nav>
            {title && (
              <header className="atlas-pagehead">
                <span className="atlas-pagehead__number">{String(step).padStart(2, "0")}</span>
                <div>
                  <p>{current.en}</p>
                  <h1>{title}</h1>
                  {subtitle && <span>{subtitle}</span>}
                </div>
              </header>
            )}
            <div className="atlas-content">{children}</div>
          </section>
        </div>
      ) : children}
    </main>
  );
}
