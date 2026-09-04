"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useExperience } from "@/src/app";
import { explainCard, type ConfirmedSoundCard } from "@/src/domain/sound-card";
import { FIELD_OPTIONS } from "@/src/mocks/mockData";
import { PageShell } from "@/src/components/navigation";
import { isUserAddedSound, SoundCreature, SoundIdentityGlyph } from "@/src/components/sound";
import { usePageRouter } from "@/src/features/page-transition";
import { buildRecognitionAssessment } from "@/src/features/teaching-agent";
import { librarySelectionProgress, nextSelectedCardId, parseLibrarySelection, serializeLibrarySelection } from "@/src/features/library-selection/librarySelection";

export function CardConfirmPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = usePageRouter();
  const { audioAssets, bindCardToLibrarySource, cards, currentCard, pausePlayback, playCard, playback, recordings, selectCard, units, updateCurrentCard, confirmCurrentCard } = useExperience();
  const card = cards.find((item) => item.id === params.id) ?? currentCard;
  const cardUnit = units.find((item) => item.cardId === card.id);
  const sourcePlaying = playback.status === "playing" && Boolean(cardUnit && playback.activeSoundUnitIds.includes(cardUnit.id));
  const source = search.get("source") ?? "card";
  const capture = search.get("capture") === "upload" ? "upload" : "camera";
  const librarySelection = parseLibrarySelection(search.get("batch"));
  const selectionProgress = librarySelectionProgress(librarySelection, card.id);
  const batchValue = serializeLibrarySelection(librarySelection);
  const [useCardParameters, setUseCardParameters] = useState(true);
  const unit = units.find((item) => item.cardId === card.id);
  const selectedAsset = audioAssets.find((asset) => asset.id === unit?.originalAudioAssetId);
  const userAddedSource = unit ? isUserAddedSound(unit, selectedAsset) : false;
  const systemSources = audioAssets.filter((asset) => asset.kind !== "local_recording");
  const selectedSourceValue = unit?.originalAudioAssetId.startsWith("audio-recording-")
    ? `recording:${unit.originalAudioAssetId.slice("audio-".length)}`
    : card.sourceSelectionRequired ? "" : `asset:${unit?.originalAudioAssetId ?? ""}`;
  const recognition = buildRecognitionAssessment(card);
  const childTip = explainCard(card);
  const nextLibraryCardId = source === "library" ? nextSelectedCardId(librarySelection, card.id) : null;
  const nextPaperDraft = source === "card" ? cards.find((item) => item.paperCardId === card.paperCardId && item.id !== card.id && item.confirmedAt === "paper-draft") : null;
  const preparing = playback.status === "loading";
  useEffect(() => { if (params.id && currentCard.id !== params.id) selectCard(params.id); }, [currentCard.id, params.id, selectCard]);

  const setField = (field: keyof Pick<ConfirmedSoundCard, "pitch" | "duration" | "contour" | "intensity" | "pattern">, value: string) => {
    if (sourcePlaying) pausePlayback();
    updateCurrentCard({ [field]: value });
  };
  const choosePreviewMode = (enabled: boolean) => {
    if (sourcePlaying) pausePlayback();
    setUseCardParameters(enabled);
  };
  const chooseSource = (value: string) => {
    const [kind, id] = value.split(":", 2);
    if (kind === "asset" && id) bindCardToLibrarySource(card.id, { kind: "asset", id });
    if (kind === "recording" && id) bindCardToLibrarySource(card.id, { kind: "recording", id });
  };
  const recordMissingSource = () => {
    const query = new URLSearchParams({
      entry: "record",
      source: "record",
      returnCardId: card.id,
      returnCapture: capture,
      suggestedName: card.source.label,
      contributor: card.owner,
      place: card.place,
      date: card.recordedAt.replaceAll(".", "-"),
    });
    router.push(`/cards?${query.toString()}`);
  };
  const finish = () => {
    if (card.sourceSelectionRequired) return;
    confirmCurrentCard(card.id);
    if (nextLibraryCardId) {
      router.push(`/cards/${nextLibraryCardId}/confirm?entry=record&source=library&batch=${encodeURIComponent(batchValue)}`);
      return;
    }
    if (nextPaperDraft) {
      router.push(`/cards/${nextPaperDraft.id}/confirm?entry=diary&source=card&capture=${capture}`);
      return;
    }
    const worldQuery = new URLSearchParams({ focus: card.id, source });
    if (source === "library" && batchValue) worldQuery.set("batch", batchValue);
    router.push(`/world?${worldQuery.toString()}`);
  };

  return (
    <PageShell
      step={3}
      title={source === "card" ? "让纸卡里的声音第一次被听见" : "这段基础声要怎样出现？"}
      subtitle={source === "card"
        ? "核对识图结果、确认真实音源并写好声音配方；可以随时对比塑形版和未处理原声。"
        : `选择高低、长短、声音变化、强弱与出现方式，并直接试听塑形前后的区别。${source === "library" && librarySelection.length > 1 ? ` 当前是所选声音 ${selectionProgress.index + 1}/${selectionProgress.total}。` : ""}`}
    >
      <div className="read-card-grid">
        <aside className="scan-panel">
          <div className="scan-panel__head"><span>{source === "card" ? "SCANNED DIARY" : "SOURCE ASSET"}</span><b>{card.id.toUpperCase()} · 07</b></div>
          <div className="scan-paper">
            <p>声音日记 · {card.owner}</p>
            <SoundIdentityGlyph userAdded={userAddedSource}><SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} size="large" /></SoundIdentityGlyph>
            <h2>我听见了「{card.source.label}」</h2>
            <span>「{card.childNote}」</span>
            <footer><b>{card.place}</b><b>{card.recordedAt}</b></footer>
          </div>
          <div className="scan-source"><span>{source === "record" ? "录音链路示例素材" : source === "library" ? "环境专属声音库" : "纸质声卡识别"}</span><p>记录与素材来源会随声音进入作品，可随时回溯。</p></div>
        </aside>

        <section className="reading-panel">
          <header className="reading-panel__head">
            <div><span>{source === "card" ? "TEMPLATE READ / 待确认" : "SOURCE SELECTED / 待塑形"}</span><h2>{source === "card" ? "声卡写的是" : "当前基础声"}：{card.source.label}</h2></div>
          </header>

          {source === "card" && recognition.needsTeacherReview && <section className="agent-recognition agent-recognition--review" aria-label="声音卡读取提醒">
            <div className="agent-recognition__top">
              <span>纸卡读取提醒 · {recognition.methodLabel}</span>
              <b>请核对</b>
            </div>
            <p>{recognition.reason}</p>
          </section>}

          <div className="reading-row reading-row--source">
            <div><strong>声音来源</strong><small>SOURCE</small></div>
            <div className="source-correction">
              <select value={selectedSourceValue} onChange={(event) => chooseSource(event.target.value)} aria-label="从声音库确认声音来源">
                <option value="" disabled>选择声音库里的真实原声</option>
                <optgroup label="系统自带声音">{systemSources.map((asset) => <option value={`asset:${asset.id}`} key={asset.id}>{asset.label}</option>)}</optgroup>
                {recordings.length > 0 && <optgroup label="我的录音">{recordings.map((recording) => <option value={`recording:${recording.id}`} key={recording.id}>{recording.name} · {recording.contributorName}</option>)}</optgroup>}
              </select>
              <button type="button" disabled={card.sourceSelectionRequired} onClick={() => { setUseCardParameters(false); void playCard(card.id, { fullOriginal: true, allowDraft: true }); }}>{sourcePlaying ? "❚❚ 暂停" : "▶ 试听原声"}</button>
              <button type="button" className="source-correction__record" onClick={recordMissingSource}>库里没有？录一段补进去</button>
              {card.sourceSelectionRequired && <p>先确认真实音源，才能让声音诞生。</p>}
            </div>
          </div>

          <ReadingChoice label="高低" english="PITCH" value={card.pitch} options={FIELD_OPTIONS.pitch} onChange={(value) => setField("pitch", value)} />
          <ReadingChoice label="长短" english="LENGTH" value={card.duration} options={FIELD_OPTIONS.duration} onChange={(value) => setField("duration", value)} />
          <ReadingChoice label="声音变化" english="CONTOUR" value={card.contour} options={FIELD_OPTIONS.contour} onChange={(value) => setField("contour", value)} />
          <ReadingChoice label="强弱" english="DYNAMICS" value={card.intensity} options={FIELD_OPTIONS.intensity} onChange={(value) => setField("intensity", value)} />
          <ReadingChoice label="出现方式" english="PATTERN" value={card.pattern} options={FIELD_OPTIONS.pattern} onChange={(value) => setField("pattern", value)} last />
          <section className="reading-preview" aria-label="试听声音塑形前后的区别">
            <div className="reading-preview__controls">
              <div className="birth-mode-toggle" role="group" aria-label="选择是否加入声音配方">
                <button className={useCardParameters ? "is-selected" : ""} aria-pressed={useCardParameters} onClick={() => choosePreviewMode(true)}><strong>加入配方</strong><small>声卡塑形版</small></button>
                <button className={!useCardParameters ? "is-selected" : ""} aria-pressed={!useCardParameters} onClick={() => choosePreviewMode(false)}><strong>不加配方</strong><small>未处理原声</small></button>
              </div>
              <button className="birth-play" disabled={preparing || card.sourceSelectionRequired} onClick={() => void playCard(card.id, { fullOriginal: !useCardParameters, allowDraft: true })}>{preparing ? "正在准备…" : sourcePlaying ? "❚❚ 暂停" : useCardParameters ? "▶ 播放塑形版" : "▶ 播放未处理原声"}</button>
            </div>
            <div className="reading-preview__copy"><span>小耳朵发现</span><p>{childTip}</p></div>
            {playback.status === "error" && <p className="birth-play-error" role="alert">{playback.errorMessage}</p>}
          </section>
        </section>
      </div>

      <div className="atlas-navfoot">
        <button onClick={() => router.push(source === "card" ? `/cards?entry=diary&capture=${capture}` : `/cards?entry=record&source=${source}${batchValue ? `&batch=${encodeURIComponent(batchValue)}` : ""}`)}>← <span>重新选择 / BACK</span></button>
        <button className="atlas-navfoot__next" disabled={Boolean(card.sourceSelectionRequired)} onClick={finish}><span>{card.sourceSelectionRequired ? "请先确认真实音源" : nextLibraryCardId || nextPaperDraft ? "保存调整 · 继续下一个声音" : "完成调整 · 放进万物声场"}</span> →</button>
      </div>
    </PageShell>
  );
}

function ReadingChoice({ label, english, value, options, onChange, last = false }: { label: string; english: string; value: string; options: readonly { value: string; label: string }[]; onChange(value: string): void; last?: boolean }) {
  return (
    <div className={`reading-row ${last ? "reading-row--last" : ""}`}>
      <div><strong>{label}</strong><small>{english}</small></div>
      <div className="reading-options">
        {options.map((option) => <button className={option.value === value ? "is-selected" : ""} onClick={() => onChange(option.value)} key={option.value}>{option.label}</button>)}
      </div>
    </div>
  );
}
