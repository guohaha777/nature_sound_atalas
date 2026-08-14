"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useExperience } from "@/src/app";
import { FIELD_LABELS, type PitchChoice } from "@/src/domain/sound-card";
import { listEligibleSoundWorldItems, WORLD_LAST_BEAT } from "@/src/features/sound-world";
import { clampEmotionCoordinate, resolveEmotionSelection } from "@/src/features/composition-emotion";
import { buildCompositionPlaybackTimeline } from "@/src/features/composition-playback";
import type { MockSoundCard } from "@/src/mocks/mockData";
import { PageShell } from "@/src/components/navigation";
import { isUserAddedSound, SoundCreature, SoundIdentityGlyph } from "@/src/components/sound";
import { usePageRouter } from "@/src/features/page-transition";

type Scope = "mine" | "class";
type EventPlacement = { eventId: string; startBeat: number; pitch: PitchChoice };

const PITCH_TOP = { high: 18, mid: 49, low: 78 } as const;

export function SoundWorldPage() {
  const router = usePageRouter();
  const search = useSearchParams();
  const { audioAssets, cards, composition, units, hydrated, setActiveUnits, playCard, playComposition, pausePlayback, playback, polishErrorMessage, generatePolish, dismissPolishFailure, togglePolish, moveWorldEvent, duplicateWorldEvent, deleteWorldEvent, setCompositionEmotion, setCompositionEmotionPoint } = useExperience();
  const initialized = useRef(false);
  const fieldRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ eventId: string; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null);
  const draggedEventRef = useRef<string | null>(null);
  const pendingDropRef = useRef<{ unitId: string; startBeat: number; pitch: PitchChoice } | null>(null);
  const eligibleItems = useMemo(() => listEligibleSoundWorldItems(cards, units, audioAssets), [audioAssets, cards, units]);
  const owners = useMemo(() => Array.from(new Set(eligibleItems.map((item) => (item.card as MockSoundCard).owner).filter((name) => name !== "系统"))), [eligibleItems]);
  const focusCardId = search.get("focus");
  const entrySource = search.get("source");
  const focusCard = cards.find((card) => card.id === focusCardId) as MockSoundCard | undefined;
  const [scope, setScope] = useState<Scope>("class");
  const [owner, setOwner] = useState(focusCard?.owner ?? owners[0] ?? "小雨");
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(focusCardId);
  const [openEventMenu, setOpenEventMenu] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<EventPlacement | null>(null);
  const [scorePlaybackActive, setScorePlaybackActive] = useState(false);
  const [emotionDialogOpen, setEmotionDialogOpen] = useState(false);
  const [draftEmotion, setDraftEmotion] = useState({ valence: 0, arousal: 0 });
  const [draftEmotionSelected, setDraftEmotionSelected] = useState(false);
  const [preparingBackground, setPreparingBackground] = useState(false);
  const [backgroundFailureOpen, setBackgroundFailureOpen] = useState(false);

  useEffect(() => {
    if (!hydrated || initialized.current || eligibleItems.length === 0) return;
    initialized.current = true;
    if (focusCardId) {
      const focused = eligibleItems.find((item) => item.card.id === focusCardId);
      if (focused) {
        const ids = entrySource === "card" && focused.unit.inputMode === "paper_card"
          ? eligibleItems.filter((item) => item.card.paperCardId === focused.card.paperCardId).map((item) => item.unit.id)
          : [focused.unit.id];
        setActiveUnits(ids);
        return;
      }
    }
    if (!composition) setActiveUnits(eligibleItems.filter((item) => item.unit.active).slice(0, 3).map((item) => item.unit.id));
  }, [composition, eligibleItems, entrySource, focusCardId, hydrated, setActiveUnits]);

  useEffect(() => {
    const pendingDrop = pendingDropRef.current;
    if (!pendingDrop || !composition) return;
    const event = composition.events.find((item) => item.soundUnitId === pendingDrop.unitId);
    if (!event) return;
    moveWorldEvent(event.id, { startBeat: pendingDrop.startBeat, pitch: pendingDrop.pitch });
    pendingDropRef.current = null;
  }, [composition, moveWorldEvent]);

  const selectedIds = composition?.soundUnitIds ?? units.filter((unit) => unit.active).map((unit) => unit.id);
  const selectedSet = new Set(selectedIds);
  const selectedItems = selectedIds.flatMap((id) => {
    const item = eligibleItems.find((candidate) => candidate.unit.id === id);
    return item ? [item] : [];
  });
  const scoreEvents = composition?.events.filter((event) => selectedSet.has(event.soundUnitId)) ?? [];
  const historyItems = eligibleItems.filter((item) => isUserAddedSound(item.unit, item.asset));
  const systemItems = eligibleItems.filter((item) => !isUserAddedSound(item.unit, item.asset));
  const selectedArchiveItem = eligibleItems.find((item) => item.unit.id === selectedUnitId || item.card.id === selectedUnitId) ?? null;

  const setSelection = (ids: string[]) => setActiveUnits(Array.from(new Set(ids)));
  const previewArchiveItem = (item: (typeof eligibleItems)[number]) => {
    setScorePlaybackActive(false);
    setSelectedUnitId(item.unit.id);
    void playCard(item.card.id);
  };
  const chooseScope = (nextScope: Scope) => {
    setScope(nextScope);
    const next = nextScope === "mine"
      ? eligibleItems.find((item) => (item.card as MockSoundCard).owner === owner && item.unit.provenance.archiveScopes.includes("personal"))
      : selectedArchiveItem?.unit.provenance.archiveScopes.includes("classroom") ? selectedArchiveItem : eligibleItems.find((item) => item.unit.provenance.archiveScopes.includes("classroom"));
    setSelectedUnitId(next?.unit.id ?? null);
  };
  const chooseOwner = (name: string) => {
    setOwner(name);
    const next = eligibleItems.find((item) => (item.card as MockSoundCard).owner === name && item.unit.provenance.archiveScopes.includes("personal"));
    setSelectedUnitId(next?.unit.id ?? null);
  };
  const onlyOwner = () => setSelection(eligibleItems.filter((item) => (item.card as MockSoundCard).owner === owner && item.unit.provenance.archiveScopes.includes("personal")).map((item) => item.unit.id));
  const placementFromPoint = (clientX: number, clientY: number) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return {
      startBeat: Math.round(x * WORLD_LAST_BEAT * 2) / 2,
      pitch: (y < 0.33 ? "high" : y < 0.66 ? "mid" : "low") as PitchChoice,
    };
  };
  const addDroppedSound = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/sound-unit-id");
    const placement = placementFromPoint(event.clientX, event.clientY);
    if (!id || !placement || !eligibleItems.some((item) => item.unit.id === id) || selectedSet.has(id)) return;
    pendingDropRef.current = { unitId: id, ...placement };
    setSelection([...selectedIds, id]);
  };
  const startEventDrag = (event: ReactPointerEvent<HTMLButtonElement>, eventId: string) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { eventId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
  };
  const moveEventDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
    if (!drag.moved) return;
    const placement = placementFromPoint(event.clientX, event.clientY);
    if (placement) setDragPreview({ eventId: drag.eventId, ...placement });
  };
  const finishEventDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved && dragPreview?.eventId === drag.eventId) {
      draggedEventRef.current = drag.eventId;
      moveWorldEvent(drag.eventId, dragPreview);
    }
    dragRef.current = null;
    setDragPreview(null);
  };
  const playWorldScore = () => {
    if (scorePlaybackActive && playback.status === "playing") {
      pausePlayback();
      return;
    }
    setScorePlaybackActive(true);
    void playComposition({ includePolish: false });
  };
  const openEmotionDialog = () => {
    if (selectedItems.length < 1) return;
    if (playback.status === "playing") pausePlayback();
    const intent = composition?.emotionIntent;
    setDraftEmotion({ valence: intent?.valence ?? 0, arousal: intent?.arousal ?? 0 });
    setDraftEmotionSelected(Boolean(intent?.enabled));
    setEmotionDialogOpen(true);
  };
  const updateDraftEmotionFromPoint = (clientX: number, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setDraftEmotion({
      valence: clampEmotionCoordinate(((clientX - rect.left) / rect.width) * 2 - 1),
      arousal: clampEmotionCoordinate(1 - ((clientY - rect.top) / rect.height) * 2),
    });
    setDraftEmotionSelected(true);
  };
  const nudgeDraftEmotion = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 0.2 : 0.06;
    const delta = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, step] : event.key === "ArrowDown" ? [0, -step] : null;
    if (!delta) return;
    event.preventDefault();
    setDraftEmotion((current) => ({ valence: clampEmotionCoordinate(current.valence + delta[0]), arousal: clampEmotionCoordinate(current.arousal + delta[1]) }));
    setDraftEmotionSelected(true);
  };
  const enterComposeWithBackground = async () => {
    setEmotionDialogOpen(false);
    setBackgroundFailureOpen(false);
    setPreparingBackground(true);
    const generated = await generatePolish(false);
    setPreparingBackground(false);
    if (generated) router.push("/compose");
    else setBackgroundFailureOpen(true);
  };
  const skipEmotion = async () => {
    setCompositionEmotion(null);
    await enterComposeWithBackground();
  };
  const confirmEmotion = async () => {
    if (!draftEmotionSelected) return;
    const selection = resolveEmotionSelection(draftEmotion.valence, draftEmotion.arousal);
    setCompositionEmotionPoint({ ...draftEmotion, label: selection.label });
    await enterComposeWithBackground();
  };
  const selectPlanB = async () => {
    setBackgroundFailureOpen(false);
    setPreparingBackground(true);
    const generated = await generatePolish(true);
    setPreparingBackground(false);
    if (generated) router.push("/compose");
    else setBackgroundFailureOpen(true);
  };
  const retryMusicModel = async () => {
    setBackgroundFailureOpen(false);
    setPreparingBackground(true);
    const generated = await generatePolish(false);
    setPreparingBackground(false);
    if (generated) router.push("/compose");
    else setBackgroundFailureOpen(true);
  };
  const continueWithoutBackground = () => {
    togglePolish(false);
    dismissPolishFailure();
    setBackgroundFailureOpen(false);
    router.push("/compose");
  };

  const currentScoreBeat = Math.min(WORLD_LAST_BEAT, playback.currentTime * ((composition?.bpm ?? 88) / 60));
  const scorePlayheadLeft = 6 + (currentScoreBeat / WORLD_LAST_BEAT) * 88;
  const worldTimeline = buildCompositionPlaybackTimeline(composition, audioAssets, WORLD_LAST_BEAT);
  const triggerWindowSeconds = WORLD_LAST_BEAT * (60 / (composition?.bpm ?? 88));
  const tailPlaying = scorePlaybackActive && playback.status === "playing" && playback.activeCompositionEventIds.length > 0 && playback.currentTime > triggerWindowSeconds && playback.currentTime < worldTimeline.audibleDurationSeconds;
  const emotionSelection = resolveEmotionSelection(draftEmotion.valence, draftEmotion.arousal);

  return (
    <PageShell step={4} title="直接把声音摆进同一张谱" subtitle="上下拖动决定高中低谱，左右拖动决定出现先后。复制出的每一个声音点都可以独立移动，也可以叠在同一位置同时出现。">
      <div className="archive-toolbar">
        <div className="archive-scope" aria-label="档案范围">
          <button className={scope === "mine" ? "is-active" : ""} onClick={() => chooseScope("mine")}><span>01</span>个人声音<small>PERSONAL</small></button>
          <button className={scope === "class" ? "is-active" : ""} onClick={() => chooseScope("class")}><span>02</span>班级声音<small>CLASSROOM</small></button>
        </div>
        {scope === "mine" ? <div className="owner-filter"><span>选择贡献者</span>{owners.map((name) => <button className={name === owner ? "is-active" : ""} onClick={() => chooseOwner(name)} key={name}>{name}<small>{eligibleItems.filter((item) => (item.card as MockSoundCard).owner === name).length} 个声音</small></button>)}<button className="owner-filter__only" onClick={onlyOwner}>使用这个孩子的全部声音 →</button></div> : <p className="archive-summary"><strong>本地班级声场</strong><span>{owners.length} 位记录者 · {eligibleItems.length} 个可用 SoundUnit · 不限加入数量</span></p>}
      </div>

      <div className="sound-field-layout sound-field-layout--editor">
        <div className="world-editor">
          <section ref={fieldRef} className="sound-field sound-field--direct" aria-label="可直接拖动的声音编排声场" onDragOver={(event) => event.preventDefault()} onDrop={addDroppedSound}>
            {(["high", "mid", "low"] as const).map((pitch) => <div className={`sound-field__axis sound-field__axis--${pitch}`} key={pitch}><span>{pitch === "high" ? "HIGH 高" : pitch === "mid" ? "MID 中" : "LOW 低"}</span></div>)}
            <span className="sound-field__time">先出现 ← 直接拖动时间位置 → 后出现</span>
            {scorePlaybackActive && <div className="world-playhead" style={{ left: `${scorePlayheadLeft}%` }} aria-hidden="true" />}
            {tailPlaying && <span className="world-tail-status">触发线已到终点 · 正在完整播放尾音</span>}
            {scoreEvents.map((scoreEvent) => {
              const item = eligibleItems.find((candidate) => candidate.unit.id === scoreEvent.soundUnitId);
              if (!item) return null;
              const card = item.card as MockSoundCard;
              const displayName = card.displayName ?? card.source.label;
              const preview = dragPreview?.eventId === scoreEvent.id ? dragPreview : null;
              const startBeat = preview?.startBeat ?? scoreEvent.startBeat;
              const pitch = preview?.pitch ?? (scoreEvent.semitoneShift >= 4 ? "high" : scoreEvent.semitoneShift <= -4 ? "low" : "mid");
              const samePosition = scoreEvents.filter((candidate) => candidate.id !== scoreEvent.id && candidate.startBeat === scoreEvent.startBeat && candidate.semitoneShift === scoreEvent.semitoneShift);
              const overlapIndex = samePosition.filter((candidate) => candidate.id < scoreEvent.id).length;
              const occurrenceIndex = scoreEvents.filter((candidate) => candidate.soundUnitId === scoreEvent.soundUnitId).findIndex((candidate) => candidate.id === scoreEvent.id) + 1;
              const activeSound = scorePlaybackActive && playback.activeCompositionEventIds.includes(scoreEvent.id);
              const capsuleWidth = scoreEvent.durationBeats <= 0.5 ? 58 : scoreEvent.durationBeats <= 1 ? 82 : Math.min(142, 82 + scoreEvent.durationBeats * 18);
              const userAdded = isUserAddedSound(item.unit, item.asset);
              return <article className={`field-being field-occurrence is-included ${activeSound ? "is-playing" : ""}`} style={{ left: `calc(${6 + (startBeat / WORLD_LAST_BEAT) * 88}% + ${overlapIndex * 10}px)`, top: `${PITCH_TOP[pitch]}%`, "--being-color": card.color, "--being-width": `${capsuleWidth}px`, "--being-height": "58px" } as React.CSSProperties} key={scoreEvent.id}>
                <button className="field-being__body" onPointerDown={(event) => startEventDrag(event, scoreEvent.id)} onPointerMove={moveEventDrag} onPointerUp={finishEventDrag} onPointerCancel={finishEventDrag} onClick={(event) => { event.stopPropagation(); if (draggedEventRef.current === scoreEvent.id) { draggedEventRef.current = null; return; } previewArchiveItem(item); }} aria-label={`拖动或试听${displayName}，第${occurrenceIndex}次出现`}><SoundIdentityGlyph userAdded={userAdded}><SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} active={activeSound} size="small" /></SoundIdentityGlyph></button>
                <span>{displayName} · {occurrenceIndex}</span>
                <button className="field-being__menu-trigger" onClick={(event) => { event.stopPropagation(); setOpenEventMenu(openEventMenu === scoreEvent.id ? null : scoreEvent.id); }} aria-label={`编辑${displayName}的这个声音点`}>•••</button>
                {openEventMenu === scoreEvent.id && <div className="field-being__menu"><button onClick={() => { duplicateWorldEvent(scoreEvent.id); setOpenEventMenu(null); }}>复制声音点</button><button onClick={() => { deleteWorldEvent(scoreEvent.id); setOpenEventMenu(null); }}>删除声音点</button></div>}
              </article>;
            })}
            {scoreEvents.length === 0 && <div className="sound-field__drop-empty"><strong>从右侧拖一个声音进来</strong><span>手机上可以点“加入曲谱”</span></div>}
          </section>
        </div>

        <aside className="sound-inspector sound-library-drawer">
          <div className="sound-library-drawer__head"><span>SOUND LIBRARY</span><h2>拖进曲谱</h2><p>已确认并绑定真实音源的声音都可加入，不限制数量。</p></div>
          <div className="sound-library-drawer__groups">
            {([["历史声音", "你录制或从纸卡加入的声音", historyItems], ["系统声音", "应用内置且始终可用", systemItems]] as const).map(([title, note, items]) => <details className="sound-library-group" open key={title}>
              <summary><span><strong>{title}</strong><small>{note}</small></span><em>{items.length}</em></summary>
              <div className="sound-library-drawer__list">{items.map((item) => {
              const card = item.card as MockSoundCard;
              const displayName = card.displayName ?? card.source.label;
              const included = selectedSet.has(item.unit.id);
              return <div className={`sound-library-drawer__item ${included ? "is-included" : ""} ${selectedArchiveItem?.unit.id === item.unit.id ? "is-selected" : ""}`} draggable={!included} onDragStart={(event) => event.dataTransfer.setData("text/sound-unit-id", item.unit.id)} key={item.unit.id}>
                <button className="sound-library-drawer__preview" onClick={() => previewArchiveItem(item)} aria-label={`${playback.status === "playing" && playback.activeSoundUnitIds.includes(item.unit.id) ? "暂停" : "试听"}${displayName}`}><span><SoundIdentityGlyph userAdded={isUserAddedSound(item.unit, item.asset)}><SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} size="small" /></SoundIdentityGlyph></span><span><strong>{displayName}</strong><small>{card.owner} · 原声：{item.asset.label}</small></span></button>
                <button disabled={included} onClick={() => setSelection([...selectedIds, item.unit.id])}>{included ? "已加入" : "加入曲谱"}</button>
              </div>;
              })}</div>
            </details>)}
          </div>
          {selectedArchiveItem ? <Inspector item={selectedArchiveItem} playing={playback.status === "playing" && playback.activeSoundUnitIds.includes(selectedArchiveItem.unit.id)} onPlay={() => previewArchiveItem(selectedArchiveItem)} /> : <div className="sound-inspector__empty"><span>{String(eligibleItems.length).padStart(2, "0")}</span><h2>试听一个声音</h2><p>这里会显示贡献者、原卡、原声和六字段。</p></div>}
        </aside>
      </div>

      {composition?.contextAnalysis?.notice && <p className="world-listening-note" role="status"><strong>先听一听：</strong>{composition.contextAnalysis.notice}</p>}

      <div className="atlas-navfoot atlas-navfoot--sticky">
        <button onClick={() => router.back()}>← <span>上一步 / BACK</span></button>
        <p><strong>{selectedItems.length}</strong> 个声音 · {scoreEvents.length} 个声音胶囊 <small>{playback.status === "loading" ? "正在准备完整音频…" : tailPlaying ? "曲谱触发完成，长原声尾音仍在完整播放" : playback.status === "playing" ? "正在合听本次编排" : "拖动、复制或叠放后可直接合听"}</small></p>
        <button disabled={selectedItems.length < 1 || playback.status === "loading"} onClick={playWorldScore}><span>{scorePlaybackActive && playback.status === "playing" ? "❚❚ 暂停一起播放" : scorePlaybackActive && playback.status === "paused" ? "▶ 继续一起播放" : "试听一起播放"}</span></button>
        <button className="atlas-navfoot__next" disabled={selectedItems.length < 1} onClick={openEmotionDialog}><span>确定 · 进入万物成曲</span> →</button>
      </div>

      {emotionDialogOpen && <div className="emotion-gate-backdrop" role="presentation"><section className="emotion-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="emotion-gate-title"><span>OPTIONAL EMOTION / 整首作品只选一次</span><h2 id="emotion-gate-title">要给这首作品一个情绪方向吗？</h2><p>可以直接在四象限中点击或拖动圆点；这只引导整首作品和 AI 垫音，不改变任何单个声音。</p><button className="emotion-gate-map" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateDraftEmotionFromPoint(event.clientX, event.clientY, event.currentTarget); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateDraftEmotionFromPoint(event.clientX, event.clientY, event.currentTarget); }} onKeyDown={nudgeDraftEmotion} aria-label="情绪四象限，方向键微调，Shift加方向键大幅调整"><span className="emotion-gate-map__top">激动</span><span className="emotion-gate-map__bottom">平静</span><span className="emotion-gate-map__left">不开心</span><span className="emotion-gate-map__right">开心</span><i style={{ left: `${((draftEmotion.valence + 1) / 2) * 100}%`, top: `${((1 - draftEmotion.arousal) / 2) * 100}%` }} /></button><div className="emotion-gate-result"><small>最终生曲关键词</small><strong>{draftEmotionSelected ? emotionSelection.keyword : "尚未选择 · 可以跳过"}</strong><span>{draftEmotionSelected ? emotionSelection.note : "跳过后只按04的声音编排生成基础作品"}</span></div><div className="emotion-gate-actions"><button onClick={() => setEmotionDialogOpen(false)}>返回声场</button><button onClick={() => void skipEmotion()}>跳过情绪</button><button className="is-primary" disabled={!draftEmotionSelected} onClick={() => void confirmEmotion()}>使用这个情绪 · 生成曲子</button></div></section></div>}

      {preparingBackground && <div className="polish-failure-backdrop" role="presentation"><section className="polish-failure-dialog" role="status"><span>CREATING / 正在生成</span><h2>正在为这首作品准备背景音乐…</h2><p>先尝试音乐模型。请稍候，儿童的原声和编排不会被改变。</p></section></div>}

      {backgroundFailureOpen && <div className="polish-failure-backdrop" role="presentation"><section className="polish-failure-dialog" role="dialog" aria-modal="true" aria-labelledby="pre-compose-failure-title"><span>MUSIC MODEL / 暂未连接</span><h2 id="pre-compose-failure-title">音乐模型暂时没有生成成功</h2><p>{polishErrorMessage ?? "暂时无法连接音乐模型。"}</p><p>可以改用智能音符方案继续生成背景，不影响孩子采集的原声。</p><div><button onClick={() => void retryMusicModel()}>重试音乐模型</button><button className="is-primary" onClick={() => void selectPlanB()}>使用 Plan B · 智能音符方案</button><button onClick={continueWithoutBackground}>只听儿童声音</button></div></section></div>}
    </PageShell>
  );
}

function Inspector({ item, playing, onPlay }: { item: ReturnType<typeof listEligibleSoundWorldItems>[number]; playing: boolean; onPlay(): void }) {
  const card = item.card as MockSoundCard;
  const displayName = card.displayName ?? card.source.label;
  return <div className="sound-inspector__detail sound-inspector__detail--compact">
    <header><span style={{ background: card.color }}>{isUserAddedSound(item.unit, item.asset) ? "🌟" : card.ownerInitials}</span><div><small>SOUNDUNIT / 声音档案</small><h2>{displayName}</h2></div></header>
    <section><strong>{item.unit.provenance.contributorName} 的声音</strong><p>{item.unit.provenance.place} · {item.unit.provenance.recordedAt}</p><p>原卡：{item.unit.provenance.originalCardAssetId ?? "来自录音或声音库"}</p><p>原声：{item.asset.label} · {item.unit.originalAudioAssetId}</p></section>
    <dl><div><dt>音高</dt><dd>{FIELD_LABELS.pitch[item.unit.parameters.pitch]}</dd></div><div><dt>时长</dt><dd>{FIELD_LABELS.duration[item.unit.parameters.duration]}</dd></div><div><dt>轮廓</dt><dd>{FIELD_LABELS.contour[item.unit.parameters.contour]}</dd></div><div><dt>力度</dt><dd>{FIELD_LABELS.intensity[item.unit.parameters.intensity]}</dd></div><div><dt>节奏</dt><dd>{FIELD_LABELS.pattern[item.unit.parameters.pattern]}</dd></div><div><dt>来源</dt><dd>{item.unit.inputMode}</dd></div></dl>
    <button className="inspector-play" onClick={onPlay}>{playing ? "暂停 / PAUSE" : "单独试听 / PLAY"} <span>{playing ? "❚❚" : "▶"}</span></button>
  </div>;
}
