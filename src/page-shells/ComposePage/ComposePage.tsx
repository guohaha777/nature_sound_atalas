"use client";

import { useEffect, useMemo, useState } from "react";
import { useExperience } from "@/src/app";
import { FIELD_LABELS } from "@/src/domain/sound-card";
import { AudioTransport, LayerToggle } from "@/src/components/audio";
import { PageShell } from "@/src/components/navigation";
import { isUserAddedSound, SoundCreature, SoundIdentityGlyph } from "@/src/components/sound";
import { buildCompositionPlaybackTimeline } from "@/src/features/composition-playback";
import { resolveEmotionSelection } from "@/src/features/composition-emotion";
import { startPageTransition, usePageRouter } from "@/src/features/page-transition";
import { COMPOSITION_DURATION_LABELS, COMPOSITION_DURATION_OPTIONS, compositionBeatLength } from "@/src/features/composition-duration";
import { pitchBandFromSemitoneShift } from "@/src/domain/music-mapping/mappingRulesV1";
import { durationOptionFitsUserClips, minimumCompositionSecondsForUserClips } from "@/src/features/sound-world";
import { GenerationProgress } from "@/src/components/feedback";
import { DEFAULT_COMPOSITION_DURATION_SECONDS } from "@/src/domain/composition";

const PITCH_Y = { high: 19, mid: 50, low: 80 } as const;
const INTENSITY_SIZE = { soft: 18, medium: 24, loud: 31 } as const;
const PIPELINE = ["声音档案", "选择素材", "参数处理", "可选情绪", "规则编排", "独立 AI 层", "生成作品"];
const DISCOVERY_TITLES = {
  pitch: "声音也有高低",
  layering: "声音可以错开说话",
  density: "声音也要留空位",
  dynamics: "轻一点，响一点",
  repetition: "重复会被耳朵记住",
} as const;
/** 用系统自带伴奏时的一句话说明；面向老师，不出现接口或代码术语。 */
const POLISH_FALLBACK_NOTES = {
  "not-connected": "这次没叫到 AI，系统自带的伴奏顶上了。",
  "not-configured": "这台设备还没开通 AI 背景，先听系统自带的伴奏。",
  "model-rejected": "AI 写的伴奏太吵、长度也不合适，被拦下了，换成系统自带的。",
  "quota-used": "今天的 AI 次数用完了，换系统自带的伴奏。",
} as const;

const ROLE_LABELS = { lead: "带头", response: "回答", texture: "轻轻铺在后面", pulse: "带着规律" } as const;
const ARRANGEMENT_ROLE_LABELS = { "lead-natural": "主要自然声", "rhythmic-anchor": "节奏支点", texture: "空间铺底", response: "回应", accent: "点缀" } as const;

export function ComposePage() {
  const router = usePageRouter();
  const { audioAssets, cards, units, composition, compositionAdviceStatus, hydrated, playback, polishStatus, polishErrorMessage, prepareComposition, requestCompositionAdvice, playComposition, seekPlayback, pausePlayback, togglePolish, generatePolish, dismissPolishFailure, setCompositionDuration, saveWork } = useExperience();
  useEffect(() => { if (hydrated && !composition?.naturalSoundContinuity) prepareComposition(); }, [composition?.naturalSoundContinuity, hydrated, prepareComposition]);
  useEffect(() => {
    if (!hydrated || !composition?.naturalSoundContinuity || composition.polishLayer || polishStatus !== "idle") return;
    void generatePolish(false);
  }, [composition, generatePolish, hydrated, polishStatus]);
  useEffect(() => {
    // 是否需要联网由 requestCompositionAdvice 自己判断：已有对得上的解释时它只更新状态，不会发请求。
    // 这里再判一次会让"已有缓存解释"的情况谁都不更新状态，界面永远停在"正在准备"。
    if (hydrated && composition?.naturalSoundContinuity && compositionAdviceStatus === "idle") void requestCompositionAdvice();
  }, [composition, compositionAdviceStatus, hydrated, requestCompositionAdvice]);
  const activeUnits = units.filter((unit) => composition?.soundUnitIds.includes(unit.id));
  const [pageOpenedAt] = useState(() => Date.now());
  const hasPolish = Boolean(composition?.polishLayer);
  const isOldPolish = hasPolish && composition?.polishLayer?.compositionRevision !== composition?.revision;
  const isExpiredPolish = Boolean(composition?.polishLayer?.audioExpiresAt && composition.polishLayer.audioExpiresAt * 1000 <= pageOpenedAt);
  const timeline = useMemo(() => buildCompositionPlaybackTimeline(composition, audioAssets, composition ? compositionBeatLength(composition) : 24), [audioAssets, composition]);
  const maxBeat = timeline.maxBeat;
  const minimumUserClipSeconds = minimumCompositionSecondsForUserClips(composition);
  const events = composition?.events ?? [];
  const currentBeat = playback.currentTime * ((composition?.bpm ?? 88) / 60);
  const playheadLeft = 6 + Math.min(1, currentBeat / maxBeat) * 88;
  const compositionPlayback = playback.status === "playing" || playback.status === "paused" || playback.status === "ended" || playback.status === "loading"
    ? { ...playback, duration: Math.max(playback.duration, timeline.audibleDurationSeconds) }
    : { ...playback, currentTime: 0, duration: timeline.audibleDurationSeconds, activeSoundUnitIds: [], activeCompositionEventIds: [] };
  const save = async () => {
    startPageTransition();
    const workId = await saveWork();
    if (workId) router.push(`/works/${workId}`);
  };

  const emotionSelection = composition?.emotionIntent.enabled ? resolveEmotionSelection(composition.emotionIntent.valence, composition.emotionIntent.arousal) : null;
  const contributionOwners = useMemo(() => Array.from(new Set(activeUnits.map((unit) => cards.find((card) => card.id === unit.cardId)?.owner).filter(Boolean))), [activeUnits, cards]);
  const teachingAdvice = composition && composition.teachingAdvice?.compositionRevision === composition.revision ? composition.teachingAdvice : null;
  const backgroundRecommendation = teachingAdvice?.backgroundRecommendation;
  const recommendationTitle = compositionAdviceStatus === "requesting"
    ? "正在听一听这首作品…"
    : backgroundRecommendation?.value === "helpful"
      ? "这里有一些留白，可以试试轻轻的背景"
      : backgroundRecommendation?.value === "not-needed"
        ? "孩子的声音已经很丰富，可以先不加背景"
        : "基础作品已经成立，要不要背景由你决定";
  // 以手上这份解释为准：只要它对得上当前作品就如实说明来源，
  // 不再依赖异步状态标志，避免标志被重置后界面永远停在"正在准备"。
  const advisorSource = teachingAdvice?.sourceKind === "live_ai"
    ? `千问 ${teachingAdvice.model ?? "模型"} 已完成`
    : teachingAdvice?.sourceKind === "local_rules" || compositionAdviceStatus === "fallback"
      ? "本地规则已接管"
      : compositionAdviceStatus === "requesting"
        ? "正在解释这首作品…"
        : "正在准备";
  const backgroundAction = backgroundRecommendation?.value === "not-needed" ? "仍想试听智能背景" : "生成智能背景";
  const discovery = teachingAdvice?.musicDiscovery;
  /** 编排角色写成一句能直接念给学生听的话；优先用确定性编曲的角色，其次用模型给的角色。 */
  const arrangementSummary = (() => {
    const byArranger = composition?.arrangerVersion === "arranger-v2"
      ? activeUnits.map((unit) => {
        const role = events.find((event) => event.soundUnitId === unit.id && event.arrangementRole)?.arrangementRole;
        const card = cards.find((item) => item.id === unit.cardId);
        return role && card ? `${card.displayName ?? card.source.label}负责${ARRANGEMENT_ROLE_LABELS[role]}` : null;
      }).filter(Boolean)
      : [];
    if (byArranger.length) return byArranger.join("，");
    return teachingAdvice?.roles.length
      ? teachingAdvice.roles.map((item) => `第 ${item.soundIndex} 个声音${ROLE_LABELS[item.role]}`).join("，")
      : null;
  })();
  const polishSourceLabel = composition?.polishLayer?.sourceKind === "live_ai"
    ? "AI 生成的背景音乐"
    : composition?.polishLayer?.sourceKind === "symbolic_ai"
      ? "AI 写的音符伴奏"
      : composition?.polishLayer?.sourceKind === "local_fallback"
        ? "系统自带的伴奏方案"
        : "尚未生成";
  const polishSourceNote = composition?.polishLayer?.sourceKind === "local_fallback"
    ? POLISH_FALLBACK_NOTES[composition.polishLayer.fallbackReason ?? "not-connected"]
    : composition?.polishLayer?.sourceKind === "symbolic_ai"
      ? "AI 为这首作品现写的，音量和长度都已经过关。"
      : composition?.polishLayer?.sourceKind === "live_ai"
        ? "AI 为这首作品现做的，音量和长度都已经过关。"
        : null;

  return (
    <PageShell step={5} title="让它们相遇" subtitle="儿童声音先按明确规则进入声谱；情绪是可选的创作方向，AI 背景始终是一条可关闭的独立辅助层。">
      <div className="pipeline-ribbon"><span>PIPELINE</span>{PIPELINE.map((item, index) => <span key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}{index < PIPELINE.length - 1 && <i>→</i>}</span>)}</div>

      <div className="compose-studio">
        <section className="score-panel">
          <header className="score-panel__head">
            <div><span>NOW ASSEMBLING</span><h2>三年二班 · 八月的声音</h2><p>{activeUnits.length} SOUNDS · 作品时长约 {composition?.durationSeconds ?? 0} 秒</p></div>
            <button onClick={playback.status === "playing" ? pausePlayback : () => void playComposition()} aria-label={playback.status === "playing" ? "暂停" : "播放"}>{playback.status === "playing" ? "❚❚" : "✦"}</button>
          </header>

          <div className="sound-score" aria-label="声音声谱">
            {(["high", "mid", "low"] as const).map((pitch) => <div className={`sound-score__axis sound-score__axis--${pitch}`} key={pitch}><span>{pitch === "high" ? "HIGH 高" : pitch === "mid" ? "MID 中" : "LOW 低"}</span></div>)}
            {events.map((event) => {
              const unit = units.find((item) => item.id === event.soundUnitId);
              const card = cards.find((item) => item.id === unit?.cardId);
              const asset = audioAssets.find((item) => item.id === event.audioAssetId);
              if (!card || !unit) return null;
              const playing = playback.activeCompositionEventIds.includes(event.id);
              const pitch = pitchBandFromSemitoneShift(event.semitoneShift);
              // 谱面左右各留 6% 边距：left 从 6% 起算，最远只能画到 94%。
              const startPercent = 6 + (event.startBeat / maxBeat) * 88;
              const remainingPercent = Math.max(0, 94 - startPercent);
              const capsuleWidth = event.durationBeats <= 0.5
                ? INTENSITY_SIZE[unit.parameters.intensity]
                : `min(max(${INTENSITY_SIZE[unit.parameters.intensity]}px, ${(event.durationBeats / maxBeat) * 88}%), ${remainingPercent}%)`;
              const displayName = card.displayName ?? card.source.label;
              return <div className={`score-note score-note--capsule ${playing ? "is-playing" : ""}`} style={{ left: `${startPercent}%`, top: `${PITCH_Y[pitch]}%`, width: capsuleWidth, height: INTENSITY_SIZE[unit.parameters.intensity], background: card.color } as React.CSSProperties} title={`${card.owner} · ${displayName} · ${emotionSelection?.keyword ?? "未选择情绪"}`} key={event.id}><SoundIdentityGlyph userAdded={isUserAddedSound(unit, asset)}><SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} active={playing} size="small" /></SoundIdentityGlyph></div>;
            })}
            <div className="score-playhead" style={{ left: `${playheadLeft}%` }} />
            <span className="sound-score__time">完整作品 {Math.ceil(timeline.audibleDurationSeconds)} 秒</span>
          </div>

          <div className="score-transport"><AudioTransport state={compositionPlayback} onPlay={playComposition} onPause={pausePlayback} onSeek={seekPlayback} /><p>{playback.status === "playing" ? "正在发声的声音会亮起，整首作品会在所选秒数结束" : "拖动进度点可以从任意位置开始听；每个采集声音都会进入作品"}</p></div>
        </section>

        <aside className="compose-controls">
          <section className="timeline-panel">
            <span className="atlas-label">PLAYBACK TIMELINE / 播放时间</span>
            <h3>这首作品可以有多长？</h3>
            <div className="composition-duration-control" role="group" aria-label="整首作品时长">
              {COMPOSITION_DURATION_OPTIONS.map((seconds) => { const fitsUserClips = durationOptionFitsUserClips(composition, seconds); return <button className={composition?.durationSeconds === seconds ? "is-active" : ""} aria-pressed={composition?.durationSeconds === seconds} disabled={!fitsUserClips} title={fitsUserClips ? undefined : `孩子选的声音片段有 ${minimumUserClipSeconds.toFixed(1)} 秒，放不进这个长度`} onClick={() => setCompositionDuration(seconds)} key={seconds}><strong>{COMPOSITION_DURATION_LABELS[seconds].title}</strong><small>{COMPOSITION_DURATION_LABELS[seconds].detail}</small></button>; })}
            </div>
            {COMPOSITION_DURATION_OPTIONS.some((seconds) => !durationOptionFitsUserClips(composition, seconds)) && <p className="composition-duration-floor" role="note">这次有一段声音被选成 {minimumUserClipSeconds.toFixed(1)} 秒，比它更短的作品长度会剪掉这段声音，因此暂时不能选。想用更短的作品，请回到万物声场把这段声音改短。</p>}
            <p>{composition?.durationRecommendation ? `根据这次的 ${composition.durationRecommendation.selectedSoundCount} 个声音，先推荐“${COMPOSITION_DURATION_LABELS[composition.durationRecommendation.seconds].title}”。${composition.durationRecommendation.reason}` : "系统会根据声音数量和长短先选好，你也可以修改。"} 这里只改变作品副本，原始录音仍完整保留。</p>
          </section>

          <section className="emotion-panel">
            <span className="atlas-label">CONFIRMED EMOTION / 已确认情绪</span>
            <h3>{emotionSelection?.keyword ?? "本次跳过情绪"}</h3>
            <div className="emotion-targets">
              <button className="is-active"><span style={{ background: "var(--accent)" }} />整首作品<small>{emotionSelection?.note ?? "仅按 04 编排生成"}</small></button>
            </div>
            <div className="emotion-result"><strong>{emotionSelection?.keyword ?? "不添加情绪关键词"}</strong><span>情绪只在进入 05 前选择一次。如需更改，请返回万物声场重新确认。</span><button onClick={() => router.push("/world")}>返回调整</button></div>
          </section>

          <section className="contribution-panel">
            <span className="atlas-label">CONTRIBUTIONS / 声音溯源</span>
            <p>{contributionOwners.join("、")} · {activeUnits.length} 个声音</p>
            {activeUnits.map((unit) => { const card = cards.find((item) => item.id === unit.cardId); const asset = audioAssets.find((item) => item.id === unit.originalAudioAssetId); return card ? <div className={playback.activeSoundUnitIds.includes(unit.id) ? "is-playing" : ""} key={unit.id}><SoundIdentityGlyph userAdded={isUserAddedSound(unit, asset)}><SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} size="small" /></SoundIdentityGlyph><span><strong>{card.displayName ?? card.source.label}</strong><small>{card.owner} · {FIELD_LABELS.pattern[unit.parameters.pattern]}</small></span><em>在 04 调整</em></div> : null; })}
          </section>
        </aside>
      </div>

      <section className="music-discovery" aria-live="polite">
        <div className="music-discovery__mark" aria-hidden="true"><span>♪</span><i>♫</i><b>·</b></div>
        <div className="music-discovery__copy">
          <span className="atlas-label">MUSIC DISCOVERY / 音乐小发现</span>
          <h2>{compositionAdviceStatus === "requesting" ? "正在听听你的作品…" : discovery ? DISCOVERY_TITLES[discovery.concept] : "听一听声音的变化"}</h2>
          <p>{discovery?.childText ?? "先听一遍，找找哪个声音最先被耳朵发现。"}</p>
        </div>
        <div className="music-discovery__try">
          <small>想再试一次吗？</small>
          <strong>{discovery?.tryThis ?? "听完后，说说你最先听见了谁。"}</strong>
          <button onClick={() => router.push("/world")}>回到声场试一试 →</button>
        </div>
      </section>

      <section className={`ai-layer ${hasPolish ? "is-ready" : ""}`}>
        <div className="ai-layer__identity"><span className="ai-layer__orb" /><div><span className="atlas-label">INDEPENDENT AI BACKGROUND / 独立 AI 背景层</span><h2>{polishStatus === "requesting" ? "正在尝试生成智能背景…" : polishStatus === "fallback" ? "正在播放随本曲变化的伴奏" : hasPolish ? "智能背景已与儿童声音分开" : recommendationTitle}</h2><p>{backgroundRecommendation?.reason ?? "先听孩子的声音；背景只是一种可以拒绝的试听选择。"} 系统会先试 AI 背景音乐；不成功时改用 AI 写的音符伴奏，再不成功就用系统自带的伴奏。背景不替换孩子的声音，随时可以关掉。</p></div></div>
        <div className="ai-layer__controls">
          <LayerToggle enabled={Boolean(composition?.polishEnabled)} disabled={!hasPolish} onChange={togglePolish} />
          {!hasPolish || isOldPolish || isExpiredPolish ? <button className="ai-generate" disabled={polishStatus === "requesting"} onClick={() => void generatePolish(false)}>{isExpiredPolish ? "临时音频已过期 · 重新生成" : isOldPolish ? "按新版编排重新生成" : backgroundAction}</button> : <button className="ai-generate ai-generate--quiet" disabled={polishStatus === "requesting"} onClick={() => void generatePolish(false)}>重新生成 AI 背景</button>}
          <small>图层按钮只决定播放内容；请使用上方播放键试听。{composition?.polishLayer?.direction ? ` 当前方向：${composition.polishLayer.direction.energyBand === "driving" ? "有推动感" : composition.polishLayer.direction.energyBand === "balanced" ? "平衡" : "安静"}。` : ""}</small>
        </div>
        <details className="ai-layer__audit">
          <summary>老师 / 评审：这次的声音是怎么处理的</summary>
          <div>
            <p><strong>这次的来源</strong>——背景：{polishSourceLabel}{polishSourceNote ? `（${polishSourceNote.replace(/。$/, "")}）` : ""}。作品解说：{advisorSource}。</p>
            {arrangementSummary ? <p><strong>这次给每个声音派了角色：</strong>{arrangementSummary}。<em>一首曲子就像一个班，有人领唱，有人回应，有人在后面轻轻垫着——少了谁都不一样。</em></p> : null}
            <p><strong>背景是单独的一层，</strong>压在孩子的声音下面，音量有上限，随时可以关掉。<em>背景只是伴奏，主角一直是你录回来的那个声音。</em></p>
            {discovery ? <p><strong>这首作品里的发现</strong><em>{discovery.childText} 试一试：{discovery.tryThis}</em></p> : null}
          </div>
        </details>
      </section>

      {polishStatus === "requesting" && <div className="polish-failure-backdrop" role="presentation">
        <GenerationProgress compositionDurationSeconds={composition?.durationSeconds ?? DEFAULT_COMPOSITION_DURATION_SECONDS} title="正在重新配一版背景" />
      </div>}

      {polishStatus === "failed" && <div className="polish-failure-backdrop" role="presentation"><section className="polish-failure-dialog" role="dialog" aria-modal="true" aria-labelledby="polish-failure-title"><span>MUSIC MODEL / 暂未连接</span><h2 id="polish-failure-title">音乐模型暂时没有生成成功</h2><p>{polishErrorMessage ?? "暂时无法连接音乐模型。"}</p><p>可以改用智能音符方案继续生成背景，不影响儿童原声。</p><div><button onClick={() => void generatePolish(false)}>重试音乐模型</button><button className="is-primary" onClick={() => void generatePolish(true)}>使用 Plan B · 智能音符方案</button><button onClick={dismissPolishFailure}>只听儿童声音</button></div></section></div>}

      <div className="atlas-navfoot">
        <button onClick={() => router.push("/world")}>← <span>返回声音世界</span></button>
        <p><strong>{activeUnits.length}</strong> 个孩子声音 · 完整作品 {composition?.durationSeconds ?? 0} 秒 · {hasPolish ? "含独立智能背景" : "仅基础声音层"}</p>
        <button className="atlas-navfoot__next" onClick={() => void save()}><span>保存这首作品</span> →</button>
      </div>
    </PageShell>
  );
}
