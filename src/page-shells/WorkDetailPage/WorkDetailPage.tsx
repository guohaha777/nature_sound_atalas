"use client";

import { useEffect, useMemo, useState } from "react";
import { useExperience } from "@/src/app";
import { Action } from "@/src/components/actions";
import { PageShell } from "@/src/components/navigation";
import { buildWorkDetailModel } from "@/src/features/work-detail";

function formatSavedAt(value?: string) {
  if (!value) return "时间未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function WorkDetailPage({ workId }: { workId: string }) {
  const { projectName, audioAssets, archivedCompositions, cards, units, playArchivedComposition, hydrated } = useExperience();
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const models = useMemo(() => archivedCompositions
    .map((item) => buildWorkDetailModel({ workId: item.id, composition: item, projectName, units, audioAssets }))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.composition.id === workId ? -1 : b.composition.id === workId ? 1 : (b.composition.savedAt ?? "").localeCompare(a.composition.savedAt ?? "")), [archivedCompositions, audioAssets, projectName, units, workId]);
  const selectedModel = models.find((item) => item.composition.id === selectedWorkId) ?? null;
  const selectedCoverCard = selectedModel ? cards.find((card) => card.id === selectedModel.units[0]?.cardId) : null;

  useEffect(() => {
    if (!selectedWorkId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedWorkId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedWorkId]);

  if (!hydrated) return <PageShell step={5} title="正在打开作品归档" subtitle="正在从这台设备恢复作品、声卡和原始声音。"><section className="empty-work"><p>正在整理声音书架…</p></section></PageShell>;
  if (models.length === 0) return <PageShell step={5} title="还没有作品归档" subtitle="未保存的草稿不会出现在这里。"><section className="empty-work"><p>请返回成曲页保存当前作品，或去声音世界重新选择声音。</p><div className="work-empty-actions"><Action href="/compose">返回成曲页</Action><Action tone="secondary" href="/world">去声音世界</Action></div></section></PageShell>;

  return <PageShell tone="paper" step={5} title="作品已经归档" subtitle="每张卡代表一首完整作品；可播放上一步保存的完整曲目，也可打开查看组成声音与来源。">
    <section className="work-archive-gallery" aria-label="归档作品">
      {models.map((model, index) => {
        const coverCard = cards.find((card) => card.id === model.units[0]?.cardId);
        return <article className="archive-sound-card archive-work-card" key={model.composition.id}>
        <button className="archive-sound-card__cover" style={{ "--card-color": coverCard?.color ?? "#d8a46f", "--card-accent": coverCard?.accent ?? "#7b5841" } as React.CSSProperties} onClick={() => setSelectedWorkId(model.composition.id)} aria-label={`查看作品${model.title}的档案`}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <i>ARCHIVED COMPOSITION</i>
          <strong>{model.title}</strong>
          <small>{formatSavedAt(model.composition.savedAt)} · {model.units.length} 个声音 · {model.composition.durationSeconds} 秒</small>
          {model.musicDiscovery && <div className="archive-work-card__discovery"><b>音乐小发现 · {model.musicDiscovery.sourceLabel}</b><em>{model.musicDiscovery.childText}</em></div>}
        </button>
        <button className="archive-sound-card__play" onClick={() => void playArchivedComposition(model.composition.id)} aria-label={`播放完整作品${model.title}`}><b>▶</b><span>播放完整作品</span></button>
      </article>;
      })}
    </section>
    <div className="work-again-action"><Action href="/">再来一首</Action></div>

    {selectedModel && <div className="work-card-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedWorkId(null); }}>
      <section className="work-card-dialog work-card-dialog--compact work-composition-dialog" role="dialog" aria-modal="true" aria-labelledby="work-card-dialog-title">
        <button className="work-card-dialog__close" onClick={() => setSelectedWorkId(null)} aria-label="关闭作品详情">×</button>
        <div className="work-card-dialog__visual work-card-dialog__visual--plain" style={{ "--poster-color": selectedCoverCard?.color ?? "#d8a46f", "--poster-accent": selectedCoverCard?.accent ?? "#7b5841" } as React.CSSProperties}><span>ARCHIVED COMPOSITION</span><strong>{selectedModel.title}</strong></div>
        <div className="work-card-dialog__body"><p className="section-kicker">作品档案 / COMPOSITION</p><h2 id="work-card-dialog-title">{selectedModel.title}</h2><p>{selectedModel.composition.durationSeconds} 秒作品 · 保存于 {formatSavedAt(selectedModel.composition.savedAt)}</p>
          {selectedModel.musicDiscovery && <section className="work-music-discovery"><span>MUSIC DISCOVERY / 音乐小发现</span><h3>{selectedModel.musicDiscovery.childText}</h3><p><strong>可以再试试：</strong>{selectedModel.musicDiscovery.tryThis}</p><small>{selectedModel.musicDiscovery.sourceLabel} · 使用保存作品时的匿名结构数据，不重新调用模型。</small></section>}
          <div className="work-composition-sources"><strong>组成声音 · {selectedModel.units.length}</strong>{selectedModel.units.map((unit, index) => {
            const card = cards.find((item) => item.id === unit.cardId);
            const asset = audioAssets.find((item) => item.id === unit.originalAudioAssetId);
            if (!card) return null;
            const name = card.displayName ?? card.source.label;
            return <article key={unit.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{name}</b><small>{unit.provenance.contributorName} · {unit.provenance.place} · {unit.provenance.recordedAt}</small><small>原声：{asset?.label ?? unit.originalAudioAssetId}</small></div><a href={`/sounds/${card.id}/birth?source=archive`}>回溯声卡 →</a></article>;
          })}</div>
          <button className="work-card-dialog__play" onClick={() => void playArchivedComposition(selectedModel.composition.id)}>▶ 播放这首完整作品</button>
        </div>
      </section>
    </div>}
  </PageShell>;
}
