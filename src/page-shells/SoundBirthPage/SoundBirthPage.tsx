"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useExperience } from "@/src/app";
import { FIELD_LABELS } from "@/src/domain/sound-card";
import { resolveSoundBirth } from "@/src/features/sound-birth";
import { PageShell } from "@/src/components/navigation";
import { isUserAddedSound, SoundCreature, SoundIdentityGlyph } from "@/src/components/sound";
import { usePageRouter } from "@/src/features/page-transition";

export function SoundBirthPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = usePageRouter();
  const { audioAssets, cards, currentCard, paperCards, playCard, playback, selectCard, units } = useExperience();
  const source = search.get("source") ?? "card";
  const capture = search.get("capture") === "upload" ? "upload" : "camera";
  const [useCardParameters, setUseCardParameters] = useState(true);
  const presentationCard = cards.find((item) => item.id === params.id);
  const birth = resolveSoundBirth(params.id, cards, units, audioAssets, paperCards, { followPaperSequence: source === "card" });

  useEffect(() => {
    if (presentationCard && currentCard.id !== presentationCard.id) selectCard(presentationCard.id);
  }, [currentCard.id, presentationCard, selectCard]);

  if (birth.status !== "ready" || !presentationCard) {
    const message = BIRTH_ERROR_COPY[birth.status === "ready" ? "missing-card" : birth.status];
    return (
      <PageShell step={3} title="这个声音还不能诞生" subtitle="系统不会用占位声音冒充已经确认的原声。">
        <section className="birth-error" role="alert">
          <span>03 / SOUND BIRTH</span>
          <h2>{message}</h2>
          <p>请返回采集与确认页面，完成真实音源绑定和六字段确认。</p>
          <button onClick={() => router.push(presentationCard ? `/cards/${presentationCard.id}/confirm?source=${source}&capture=${capture}` : "/cards")}>返回确认声音</button>
        </section>
      </PageShell>
    );
  }

  const active = playback.status === "playing" && playback.activeSoundUnitIds.includes(birth.unit.id);
  const preparing = playback.status === "loading";
  const belongsToHistory = isUserAddedSound(birth.unit, birth.asset);
  const paramsList = [
    ["SOURCE", "来源", birth.card.source.label],
    ["PITCH", "音高", FIELD_LABELS.pitch[birth.unit.parameters.pitch]],
    ["DURATION", "时长", FIELD_LABELS.duration[birth.unit.parameters.duration]],
    ["CONTOUR", "轮廓", FIELD_LABELS.contour[birth.unit.parameters.contour]],
    ["INTENSITY", "力度", FIELD_LABELS.intensity[birth.unit.parameters.intensity]],
    ["PATTERN", "节奏型", FIELD_LABELS.pattern[birth.unit.parameters.pattern]],
  ];
  const next = () => {
    if (birth.nextCardId) {
      router.push(`/sounds/${birth.nextCardId}/birth?source=${source}&capture=${capture}`);
      return;
    }
    const worldQuery = new URLSearchParams({ focus: birth.card.id, source });
    router.push(`/world?${worldQuery.toString()}`);
  };

  return (
    <PageShell
      step={3}
      title="它第一次可以被听见了"
      subtitle={`原始音频保持不变；播放时再按照六字段塑形。${birth.sequenceTotal > 1 ? ` 这是这张声卡的第 ${birth.sequenceIndex + 1}/${birth.sequenceTotal} 个声音。` : ""}`}
    >
      <div className="birth-grid">
        <section className={`birth-being birth-pitch--${birth.unit.parameters.pitch} birth-intensity--${birth.unit.parameters.intensity} birth-contour--${birth.unit.parameters.contour} birth-pattern--${birth.unit.parameters.pattern} ${active ? "is-active" : ""}`}>
          <div className="birth-being__orbit" style={{ "--being-color": presentationCard.color, "--birth-speed": birth.unit.parameters.duration === "long" ? "2.6s" : birth.unit.parameters.duration === "short" ? ".7s" : "1.4s" } as React.CSSProperties}>
            <button onClick={() => void playCard(birth.card.id)} aria-label={`${active ? "暂停" : "试听"}六字段塑形后的${birth.card.source.label}`}><SoundIdentityGlyph userAdded={isUserAddedSound(birth.unit, birth.asset)}><SoundCreature kind={presentationCard.creatureKind} color={presentationCard.color} accent={presentationCard.accent} size="large" active={active} /></SoundIdentityGlyph></button>
          </div>
          <p>{birth.card.source.label}</p>
          <span>「{presentationCard.childNote}」· {birth.unit.provenance.contributorName}</span>
          <div className="birth-mode-toggle" role="group" aria-label="选择是否加入声卡六字段">
            <button className={useCardParameters ? "is-selected" : ""} aria-pressed={useCardParameters} onClick={() => setUseCardParameters(true)}><strong>加入六字段</strong><small>默认 · 声卡塑形</small></button>
            <button className={!useCardParameters ? "is-selected" : ""} aria-pressed={!useCardParameters} onClick={() => setUseCardParameters(false)}><strong>关闭六字段</strong><small>对比 · 未处理原声</small></button>
          </div>
          <div className="birth-play-group">
            <button className="birth-play" disabled={preparing} onClick={() => void playCard(birth.card.id, { fullOriginal: !useCardParameters })}>{preparing ? "正在准备声音…" : active ? "❚❚ 暂停" : playback.status === "paused" ? "▶ 继续播放" : useCardParameters ? "▶ 播放声卡塑形版" : "▶ 播放未处理原声"}</button>
          </div>
          {playback.status === "error" && <p className="birth-play-error" role="alert">{playback.errorMessage}</p>}
        </section>

        <section className="birth-inspector">
          <div className="birth-inspector__block">
            <span className="atlas-label">ORIGINAL AUDIO / 原始声音库</span>
            <div className={`library-match ${belongsToHistory ? "is-active" : ""}`}><i /><div><strong>历史声音</strong><small>{belongsToHistory ? `${birth.unit.provenance.contributorName} · ${birth.unit.inputMode === "paper_card" ? "由纸质声卡加入" : "由现场录音加入"} · ${birth.card.source.label}` : "用户录音和纸卡读出的声音归档在这里"}</small></div><b>{belongsToHistory ? "当前声音" : "未选择"}</b></div>
            <div className={`library-match ${belongsToHistory ? "" : "is-active"}`}><i /><div><strong>系统声音</strong><small>{belongsToHistory ? `底层参考原声：${birth.asset.label} · 不改变用户声音归属` : `${birth.asset.label} · 系统内置原声`}</small></div><b>{belongsToHistory ? "仅引用原声" : "当前声音"}</b></div>
            <button className="text-action" onClick={() => router.push(`/cards/${birth.card.id}/confirm?source=${source}&capture=${capture}`)}>返回确认页更换原声 →</button>
          </div>
          <div className="birth-inspector__block">
            <div className="birth-inspector__title"><span className="atlas-label">DERIVED SOUNDUNIT / 声卡塑形参数</span><b>{birth.unit.mappingVersion}</b></div>
            <dl className="birth-param-list">
              {paramsList.map(([en, zh, value]) => <div key={en}><dt>{en}</dt><dd>{zh}</dd><strong>{value}</strong></div>)}
            </dl>
            <p className="birth-explanation">{birth.explanation}</p>
            <p className="birth-provenance">FROM · {birth.unit.provenance.contributorName} · {birth.unit.provenance.place} · {birth.unit.provenance.recordedAt}</p>
            <p className="birth-provenance">CARD · {birth.unit.provenance.originalCardAssetId ?? "无纸卡 · 来自录音或声音库"} · AUDIO · {birth.asset.label}</p>
          </div>
        </section>
      </div>

      <div className="atlas-navfoot">
        <button onClick={() => router.push(`/cards/${birth.card.id}/confirm?source=${source}&capture=${capture}`)}>← <span>返回修改 / BACK</span></button>
        <button className="atlas-navfoot__next" onClick={next}><span>{birth.nextCardId ? `让下一个声音诞生 · ${birth.sequenceIndex + 2}/${birth.sequenceTotal}` : "放进万物声场"}</span> →</button>
      </div>
    </PageShell>
  );
}

const BIRTH_ERROR_COPY = {
  "missing-card": "没有找到路由对应的声卡。",
  unconfirmed: "这条声卡还没有完成六字段确认。",
  "missing-unit": "这条声卡还没有生成 SoundUnit。",
  "unbound-source": "这条声卡还没有绑定真实原声。",
  "missing-audio": "绑定的原声资产已经缺失。",
} as const;
