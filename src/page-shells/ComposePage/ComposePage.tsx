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
import { COMPOSITION_DURATION_OPTIONS, compositionBeatLength } from "@/src/features/composition-duration";

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
const ROLE_LABELS = { lead: "带头", response: "回答", texture: "轻轻铺在后面", pulse: "带着规律" } as const;

export function ComposePage() {
  const router = usePageRouter();
  const { audioAssets, cards, units, composition, compositionAdviceStatus, hydrated, playback, polishStatus, polishErrorMessage, prepareComposition, requestCompositionAdvice, playComposition, pausePlayback, togglePolish, generatePolish, dismissPolishFailure, setCompositionDuration, saveWork } = useExperience();
  useEffect(() => { if (hydrated && !composition) prepareComposition(); }, [composition, hydrated, prepareComposition]);
  useEffect(() => {
    if (!hydrated || !composition || composition.polishLayer || polishStatus !== "idle") return;
    void generatePolish(false);
  }, [composition, generatePolish, hydrated, polishStatus]);
  useEffect(() => {
    if (hydrated && composition && compositionAdviceStatus === "idle" && composition.teachingAdvice?.compositionRevision !== composition.revision) void requestCompositionAdvice();
  }, [composition, compositionAdviceStatus, hydrated, requestCompositionAdvice]);
  const activeUnits = units.filter((unit) => composition?.soundUnitIds.includes(unit.id));
  const [pageOpenedAt] = useState(() => Date.now());
  const hasPolish = Boolean(composition?.polishLayer);
  const isOldPolish = hasPolish && composition?.polishLayer?.compositionRevision !== composition?.revision;
  const isExpiredPolish = Boolean(composition?.polishLayer?.audioExpiresAt && composition.polishLayer.audioExpiresAt * 1000 <= pageOpenedAt);
  const timeline = useMemo(() => buildCompositionPlaybackTimeline(composition, audioAssets, composition ? compositionBeatLength(composition) : 24), [audioAssets, composition]);
  const maxBeat = timeline.maxBeat;
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
  const advisorSource = compositionAdviceStatus === "ready" && teachingAdvice?.sourceKind === "live_ai"
    ? `千问 ${teachingAdvice.model ?? "模型"} 已完成`
    : compositionAdviceStatus === "fallback" || teachingAdvice?.sourceKind === "local_rules"
      ? "本地规则已接管"
      : "正在准备";
  const backgroundAction = backgroundRecommendation?.value === "not-needed" ? "仍想试听智能背景" : "生成智能背景";
  const validation = composition?.polishLayer?.validation;
  const discovery = teachingAdvice?.musicDiscovery;
  const analysis = composition?.contextAnalysis;
  const polishSourceLabel = composition?.polishLayer?.sourceKind === "live_ai"
    ? `Fun-Music 音频（${composition.polishLayer.model ?? "音乐模型"}）`
    : composition?.polishLayer?.sourceKind === "symbolic_ai"
      ? `大语言模型写音符（${composition.polishLayer.model ?? "千问"}）`
      : composition?.polishLayer?.sourceKind === "local_fallback"
        ? "本地动态音符方案（联网模型未成功）"
        : "尚未生成";

  return (
    <PageShell step={5} title="让它们相遇" subtitle="儿童声音先按明确规则进入声谱；情绪是可选的创作方向，AI 背景始终是一条可关闭的独立辅助层。">
      <div className="pipeline-ribbon"><span>PIPELINE</span>{PIPELINE.map((item, index) => <span key={item}><b>{String(index + 1).padStart(2, "0")}</b>{item}{index < PIPELINE.length - 1 && <i>→</i>}</span>)}</div>

      <div className="compose-studio">
        <section className="score-panel">
          <header className="score-panel__head">
            <div><span>NOW ASSEMBLING</span><h2>三年二班 · 八月的声音</h2><p>{activeUnits.length} SOUNDS · 作品时长 {composition?.durationSeconds ?? 0} 秒</p></div>
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
              const pitch = event.semitoneShift >= 4 ? "high" : event.semitoneShift <= -4 ? "low" : "mid";
              const capsuleWidth = event.durationBeats <= 0.5 ? INTENSITY_SIZE[unit.parameters.intensity] : `max(${INTENSITY_SIZE[unit.parameters.intensity]}px, ${(event.durationBeats / maxBeat) * 88}%)`;
              const displayName = card.displayName ?? card.source.label;
              return <div className={`score-note score-note--capsule ${playing ? "is-playing" : ""}`} style={{ left: `${6 + (event.startBeat / maxBeat) * 88}%`, top: `${PITCH_Y[pitch]}%`, width: capsuleWidth, height: INTENSITY_SIZE[unit.parameters.intensity], background: card.color } as React.CSSProperties} title={`${card.owner} · ${displayName} · ${emotionSelection?.keyword ?? "未选择情绪"}`} key={event.id}><SoundIdentityGlyph userAdded={isUserAddedSound(unit, asset)}><SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} active={playing} size="small" /></SoundIdentityGlyph></div>;
            })}
            <div className="score-playhead" style={{ left: `${playheadLeft}%` }} />
            <span className="sound-score__time">完整作品 {Math.ceil(timeline.audibleDurationSeconds)} 秒</span>
          </div>

          <div className="score-transport"><AudioTransport state={compositionPlayback} onPlay={playComposition} onPause={pausePlayback} /><p>{playback.status === "playing" ? "正在发声的声音会亮起，整首作品会在所选秒数结束" : "每个采集声音都会进入作品；需要时会取其中一段、重复或轻轻淡出"}</p></div>
        </section>

        <aside className="compose-controls">
          <section className="timeline-panel">
            <span className="atlas-label">PLAYBACK TIMELINE / 播放时间</span>
            <h3>选择整首作品时长</h3>
            <div className="composition-duration-control" role="group" aria-label="整首作品时长">
              {COMPOSITION_DURATION_OPTIONS.map((seconds) => <button className={composition?.durationSeconds === seconds ? "is-active" : ""} aria-pressed={composition?.durationSeconds === seconds} onClick={() => setCompositionDuration(seconds)} key={seconds}>{seconds}<small>秒整曲</small></button>)}
            </div>
            <p>选 15 秒，儿童声音和背景就会一起在 15 秒内完成。这里只剪取作品里的使用片段；声卡和归档中的原始录音仍会完整保留。</p>
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
        <div className="ai-layer__identity"><span className="ai-layer__orb" /><div><span className="atlas-label">INDEPENDENT AI BACKGROUND / 独立 AI 背景层</span><h2>{polishStatus === "requesting" ? "正在尝试生成智能背景…" : polishStatus === "fallback" ? "正在播放随本曲变化的音符背景" : hasPolish ? "智能背景已与儿童声音分开" : recommendationTitle}</h2><p>{backgroundRecommendation?.reason ?? "先听孩子的声音；背景只是一种可以拒绝的试听选择。"} 系统会先尝试 Fun-Music；暂不可用时，由大语言模型写音符方案。背景不替换基础声音，并且可以随时关闭。</p></div></div>
        <div className="ai-layer__controls">
          <LayerToggle enabled={Boolean(composition?.polishEnabled)} disabled={!hasPolish} onChange={togglePolish} />
          {!hasPolish || isOldPolish || isExpiredPolish ? <button className="ai-generate" disabled={polishStatus === "requesting"} onClick={() => void generatePolish(false)}>{isExpiredPolish ? "临时音频已过期 · 重新生成" : isOldPolish ? "按新版编排重新生成" : backgroundAction}</button> : <button className="ai-generate ai-generate--quiet" disabled={polishStatus === "requesting"} onClick={() => void generatePolish(false)}>重新生成 AI 背景</button>}
          <small>图层按钮只决定播放内容；请使用上方播放键试听。{composition?.polishLayer?.direction ? ` 当前方向：${composition.polishLayer.direction.energyBand === "driving" ? "有推动感" : composition.polishLayer.direction.energyBand === "balanced" ? "平衡" : "安静"}。` : ""}</small>
        </div>
        <details className="ai-layer__audit">
          <summary>老师 / 评审查看 AI 判断与保护</summary>
          <div>
            <p><strong>判断来源：</strong>{advisorSource}。这项判断只负责解释作品，不会替孩子改声音。</p>
            <p><strong>匿名输入：</strong>{activeUnits.length} 个声音、{events.length} 个声音点、{analysis ? `${analysis.pitchBandCounts.high}/${analysis.pitchBandCounts.mid}/${analysis.pitchBandCounts.low} 个高/中/低声音、${analysis.density === "busy" ? "较密" : analysis.density === "open" ? "较疏" : "适中"}的排列、${analysis.exactOverlapGroups} 组同时出现` : "声音的高低、轻响和重复方式"}{emotionSelection ? `，以及孩子已选择的“${emotionSelection.keyword}”方向` : "，未添加情绪方向"}。没有姓名、地点、照片或原始录音。</p>
            {teachingAdvice?.roles.length ? <p><strong>声音角色：</strong>{teachingAdvice.roles.map((item) => `第${item.soundIndex}个声音负责“${ROLE_LABELS[item.role]}”`).join("；")}。</p> : null}
            {discovery ? <p><strong>给孩子的话：</strong>{discovery.childText} 试一试：{discovery.tryThis}</p> : null}
            <p><strong>背景生成：</strong>进入本页时先自动尝试音乐模型；失败后由用户决定是否使用智能音符方案或只听儿童声音。</p>
            <p><strong>本次背景来源：</strong>{polishSourceLabel}</p>
            {validation ? <>
              <p><strong>已完成：</strong>独立图层、可信音频地址、背景音量限制、纯音乐模式请求。</p>
              <p><strong>时长：</strong>{validation.generatedDurationSeconds ? `模型返回约 ${Math.round(validation.generatedDurationSeconds)} 秒，本作品使用其中 ${Math.round(validation.playbackDurationSeconds)} 秒。` : `音符方案严格按 ${Math.round(validation.playbackDurationSeconds)} 秒生成。`}</p>
              <p><strong>尚未完成：</strong>{validation.voiceRiskCheck === "provider-request-only" ? "还没有独立音频模型复核人声风险。" : "音符背景不使用录音或人声素材。"}</p>
            </> : <p><strong>背景检查：</strong>{hasPolish ? "这是旧版背景记录，尚无本轮校验信息。" : "生成背景后显示检查结果。"}</p>}
          </div>
        </details>
      </section>

      {polishStatus === "failed" && <div className="polish-failure-backdrop" role="presentation"><section className="polish-failure-dialog" role="dialog" aria-modal="true" aria-labelledby="polish-failure-title"><span>MUSIC MODEL / 暂未连接</span><h2 id="polish-failure-title">音乐模型暂时没有生成成功</h2><p>{polishErrorMessage ?? "暂时无法连接音乐模型。"}</p><p>可以改用智能音符方案继续生成背景，不影响儿童原声。</p><div><button onClick={() => void generatePolish(false)}>重试音乐模型</button><button className="is-primary" onClick={() => void generatePolish(true)}>使用 Plan B · 智能音符方案</button><button onClick={dismissPolishFailure}>只听儿童声音</button></div></section></div>}

      <div className="atlas-navfoot">
        <button onClick={() => router.push("/world")}>← <span>返回声音世界</span></button>
        <p><strong>{activeUnits.length}</strong> 个孩子声音 · 完整作品 {composition?.durationSeconds ?? 0} 秒 · {hasPolish ? "含独立智能背景" : "仅基础声音层"}</p>
        <button className="atlas-navfoot__next" onClick={() => void save()}><span>保存这首作品</span> →</button>
      </div>
    </PageShell>
  );
}
