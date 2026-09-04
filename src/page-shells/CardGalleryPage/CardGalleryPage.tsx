"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useExperience } from "@/src/app";
import { PageShell } from "@/src/components/navigation";
import { FIELD_LABELS } from "@/src/domain/sound-card";
import { SoundCreature } from "@/src/components/sound";
import { readPaperSoundCardV1, type ReadPaperCardEntry } from "@/src/features/read-paper-card/readPaperSoundCard";
import { assessUploadedAudio, AUDIO_UPLOAD_ACCEPT, clampRecordingDuration, MAX_INGEST_DURATION_SECONDS, MAX_RECORDING_DURATION_MS } from "@/src/features/recording";
import { readAudioDurationSeconds, trimAudioBlob } from "@/src/audio/editing";
import { AudioTrimDialog, LiveWaveform } from "@/src/components/audio";
import { PAGE_TRANSITION_EVENT, startPageTransition, usePageRouter } from "@/src/features/page-transition";
import { parseLibrarySelection, serializeLibrarySelection } from "@/src/features/library-selection/librarySelection";

type CaptureMode = "record" | "library";
type UploadCandidate = { fileName: string; blob: Blob; url: string; sourceDurationSeconds: number; selection: { startSeconds: number; endSeconds: number } };

export function CardGalleryPage() {
  const router = usePageRouter();
  const search = useSearchParams();
  const { bindCardToLibrarySource, cards, contributorNames, createPaperSoundDrafts, currentCard, deleteLibraryItem, pendingCardImage, pausePlayback, playCard, playback, recordings, registerContributorName, renameLibraryItem, saveRecording, selectCard, selectRecording } = useExperience();
  const entry = search.get("entry") === "record" ? "record" : "diary";
  const captureMode: CaptureMode = search.get("source") === "library" ? "library" : "record";
  const diaryCapture = search.get("capture") === "upload" ? "upload" : "camera";
  const returnCardId = search.get("returnCardId");
  const returnCapture = search.get("returnCapture") === "upload" ? "upload" : "camera";
  const [recorded, setRecorded] = useState(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "ready" | "error">("idle");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [uploadCandidate, setUploadCandidate] = useState<UploadCandidate | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [trimming, setTrimming] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [activeLibraryItem, setActiveLibraryItem] = useState<string>(currentCard.id);
  const [selectedLibraryCardIds, setSelectedLibraryCardIds] = useState<string[]>(() => parseLibrarySelection(search.get("batch")));
  const [playingRecordingId, setPlayingRecordingId] = useState<string | null>(null);
  const [openItemMenu, setOpenItemMenu] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderStreamRef = useRef<MediaStream | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStartedAtRef = useRef(0);
  const recordingLimitTimerRef = useRef<number | null>(null);
  const recordingClockRef = useRef<number | null>(null);
  const libraryAudioRef = useRef<HTMLAudioElement>(null);
  const recordPreviewRef = useRef<HTMLAudioElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const libraryObjectUrlRef = useRef<string | null>(null);
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [readEntries, setReadEntries] = useState<ReadPaperCardEntry[] | null>(null);
  const [activePaperEntry, setActivePaperEntry] = useState<0 | 1 | 2>(0);
  const [contributorName, setContributorName] = useState(search.get("contributor") ?? "");
  const [paperNames, setPaperNames] = useState<Record<number, string>>({});
  const [captureName, setCaptureName] = useState(search.get("suggestedName") ?? "");
  const [capturePlace, setCapturePlace] = useState(search.get("place") ?? "");
  const [captureDate, setCaptureDate] = useState(search.get("date") ?? new Date().toISOString().slice(0, 10));
  const acquiredCardImage = pendingCardImage?.acquisition === diaryCapture ? pendingCardImage : null;
  const filledEntries = readEntries?.filter((item) => item.filled) ?? [];
  const normalizedContributorName = contributorName.trim();
  const systemCards = cards.filter((card) => !card.id.startsWith("card-recording-") && !card.id.startsWith("paper-card-local-"));

  useEffect(() => () => {
    recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
    libraryAudioRef.current?.pause();
    recordPreviewRef.current?.pause();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    if (libraryObjectUrlRef.current) URL.revokeObjectURL(libraryObjectUrlRef.current);
    if (recordingLimitTimerRef.current !== null) window.clearTimeout(recordingLimitTimerRef.current);
    if (recordingClockRef.current !== null) window.clearInterval(recordingClockRef.current);
  }, [recordedUrl]);

  useEffect(() => () => {
    if (uploadCandidate) URL.revokeObjectURL(uploadCandidate.url);
  }, [uploadCandidate]);

  useEffect(() => {
    const stopLocalAudio = () => {
      libraryAudioRef.current?.pause();
      recordPreviewRef.current?.pause();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      setPlayingRecordingId(null);
    };
    window.addEventListener(PAGE_TRANSITION_EVENT, stopLocalAudio);
    return () => window.removeEventListener(PAGE_TRANSITION_EVENT, stopLocalAudio);
  }, []);

  useEffect(() => {
    if (!editingItem) return;
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [editingItem]);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingState("error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream);
      recorderStreamRef.current = stream;
      recorderRef.current = recorder;
      setLiveStream(stream);
      recorderChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (recordingLimitTimerRef.current !== null) window.clearTimeout(recordingLimitTimerRef.current);
        if (recordingClockRef.current !== null) window.clearInterval(recordingClockRef.current);
        recordingLimitTimerRef.current = null;
        recordingClockRef.current = null;
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedUrl(url);
        setRecordingDurationMs(clampRecordingDuration(Date.now() - recorderStartedAtRef.current));
        setRecorded(true);
        setRecordingState("ready");
        setLiveStream(null);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderStartedAtRef.current = Date.now();
      recorder.start();
      recordingClockRef.current = window.setInterval(() => {
        setRecordingDurationMs(clampRecordingDuration(Date.now() - recorderStartedAtRef.current));
      }, 250);
      recordingLimitTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_RECORDING_DURATION_MS);
      setRecordingState("recording");
    } catch {
      setLiveStream(null);
      setRecordingState("error");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const acceptCapturedAudio = (blob: Blob, durationMs: number, suggestedName: string) => {
    recordPreviewRef.current?.pause();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(blob);
    setRecordedUrl(URL.createObjectURL(blob));
    setRecordingDurationMs(clampRecordingDuration(durationMs));
    setRecorded(true);
    setRecordingState("ready");
    if (!captureName.trim()) setCaptureName(suggestedName);
  };

  const closeUploadCandidate = () => {
    setUploadCandidate((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  /** 上传音频先读长度：不超过上限直接进入草稿，超过上限必须先截取一段。 */
  const receiveAudioFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadNotice(null);
    let sourceDurationSeconds = 0;
    try {
      sourceDurationSeconds = await readAudioDurationSeconds(file);
    } catch {
      setUploadNotice("这个音频文件读不出来。请换成 mp3、wav 或 m4a 再试。");
      return;
    }
    const assessment = assessUploadedAudio(sourceDurationSeconds);
    if (assessment.tooShort) {
      setUploadNotice(assessment.message);
      return;
    }
    if (!assessment.requiresTrim) {
      acceptCapturedAudio(file, assessment.sourceDurationSeconds * 1000, fileBaseName(file.name));
      setUploadNotice(assessment.message);
      return;
    }
    closeUploadCandidate();
    setUploadCandidate({
      fileName: file.name,
      blob: file,
      url: URL.createObjectURL(file),
      sourceDurationSeconds: assessment.sourceDurationSeconds,
      selection: assessment.suggestedSelection,
    });
  };

  const confirmUploadTrim = async (selection: { startSeconds: number; endSeconds: number }) => {
    if (!uploadCandidate) return;
    setTrimming(true);
    try {
      const trimmed = await trimAudioBlob(uploadCandidate.blob, selection);
      acceptCapturedAudio(trimmed.blob, trimmed.durationMs, fileBaseName(uploadCandidate.fileName));
      setUploadNotice(`已保留 ${(trimmed.durationMs / 1000).toFixed(1)} 秒，可以补齐信息后保存。`);
      closeUploadCandidate();
    } catch {
      setUploadNotice("截取没有成功。请换一个音频文件再试。");
    } finally {
      setTrimming(false);
    }
  };

  const saveCurrentRecording = async () => {
    if (!recordedBlob || !captureName.trim() || !normalizedContributorName || !capturePlace.trim()) return;
    startPageTransition();
    await registerContributorName(normalizedContributorName);
    const recording = { id: `recording-${crypto.randomUUID()}`, name: captureName.trim(), contributorName: normalizedContributorName, place: capturePlace.trim(), recordedAt: captureDate, mimeType: recordedBlob.type || "audio/webm", blob: recordedBlob, durationMs: recordingDurationMs, createdAt: new Date().toISOString() };
    await saveRecording(recording);
    if (returnCardId) {
      bindCardToLibrarySource(returnCardId, { kind: "recording", id: recording.id, recording });
      router.push(`/cards/${returnCardId}/confirm?entry=diary&source=card&capture=${returnCapture}`);
      return;
    }
    router.push("/cards?entry=record&source=library");
  };

  const playStoredRecording = async (id: string) => {
    const recording = recordings.find((item) => item.id === id);
    if (!recording) return;
    const audio = libraryAudioRef.current;
    if (!audio) return;
    if (playingRecordingId === id && !audio.paused) {
      audio.pause();
      setPlayingRecordingId(null);
      return;
    }
    pausePlayback();
    if (activeLibraryItem === id && libraryObjectUrlRef.current && audio.src) {
      setPlayingRecordingId(id);
      await audio.play().catch(() => setPlayingRecordingId(null));
      return;
    }
    if (libraryObjectUrlRef.current) URL.revokeObjectURL(libraryObjectUrlRef.current);
    const url = URL.createObjectURL(recording.blob);
    libraryObjectUrlRef.current = url;
    audio.src = url;
    audio.onended = () => setPlayingRecordingId(null);
    audio.onerror = () => setPlayingRecordingId(null);
    setActiveLibraryItem(id);
    setPlayingRecordingId(id);
    await audio.play().catch(() => setPlayingRecordingId(null));
  };

  const playSystemCard = (id: string) => {
    libraryAudioRef.current?.pause();
    setPlayingRecordingId(null);
    setActiveLibraryItem(id);
    selectCard(id);
    void playCard(id, { fullOriginal: true });
  };

  const toggleLibraryCard = (cardId: string, recordingId?: string) => {
    if (recordingId) selectRecording(recordingId);
    setSelectedLibraryCardIds((current) => current.includes(cardId)
      ? current.filter((id) => id !== cardId)
      : [...current, cardId]);
  };

  const beginRename = (id: string, name: string) => {
    setEditingItem(id);
    setEditingName(name);
    setConfirmDeleteItem(null);
    setOpenItemMenu(null);
  };

  const finishRename = async () => {
    if (!editingItem || !editingName.trim()) return;
    await renameLibraryItem(editingItem, editingName);
    setEditingItem(null);
  };

  const requestDelete = async (id: string) => {
    if (confirmDeleteItem !== id) {
      setConfirmDeleteItem(id);
      return;
    }
    await deleteLibraryItem(id);
    setConfirmDeleteItem(null);
    setOpenItemMenu(null);
    if (activeLibraryItem === id) setActiveLibraryItem(systemCards.find((card) => card.id !== id)?.id ?? "");
  };

  useEffect(() => {
    if (!acquiredCardImage) return;
    const reader = new FileReader();
    const receivePreview = () => setCardImageUrl(typeof reader.result === "string" ? reader.result : null);
    reader.addEventListener("load", receivePreview);
    reader.readAsDataURL(acquiredCardImage.blob);
    return () => {
      reader.removeEventListener("load", receivePreview);
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [acquiredCardImage]);

  useEffect(() => {
    if (!acquiredCardImage) return;
    let active = true;
    void readPaperSoundCardV1(acquiredCardImage.blob).then((entries) => {
      if (!active) return;
      setReadEntries(entries);
      const firstFilled = entries.find((item) => item.filled);
      if (firstFilled) setActivePaperEntry(firstFilled.entryIndex);
    }).catch(() => active && setReadEntries([]));
    return () => { active = false; };
  }, [acquiredCardImage]);

  const next = async () => {
    startPageTransition();
    await registerContributorName(normalizedContributorName);
    if (entry === "diary") {
      const draftIds = createPaperSoundDrafts({
        entries: filledEntries.map((item) => ({
          entryIndex: item.entryIndex,
          sourceLabel: paperNames[item.entryIndex]?.trim() ?? "",
          pitch: item.pitch ?? "mid",
          duration: item.duration ?? "medium",
          contour: item.contour ?? "flat",
          intensity: item.intensity ?? "medium",
          pattern: item.pattern ?? "once",
          confidence: item.confidence,
        })),
        contributorName: normalizedContributorName,
        place: capturePlace.trim(),
        recordedAt: captureDate,
        originalCardAssetId: pendingCardImage?.id ?? "current-card-image",
      });
      if (draftIds[0]) router.push(`/cards/${draftIds[0]}/confirm?entry=diary&source=card&capture=${diaryCapture}`);
      return;
    }
    const selectedCardId = selectedLibraryCardIds[0];
    if (!selectedCardId) return;
    const query = new URLSearchParams({
      entry,
      source: captureMode,
      batch: serializeLibrarySelection(selectedLibraryCardIds),
    });
    router.push(`/cards/${selectedCardId}/confirm?${query.toString()}`);
  };

  return (
    <PageShell
      step={2}
      title={entry === "diary" ? "把纸上的声音读出来" : captureMode === "record" ? "录下刚刚听见的声音" : "从声音库挑一个声音"}
      subtitle={entry === "diary"
        ? "拍下声音日记。应用先读懂来源，再按固定区域读取高低、长短、变化、强弱与出现方式。"
        : captureMode === "record"
          ? "直接录下声音，试听后补齐名称、孩子、日期和地点，再保存进声音库。"
          : "这里有你之前保存的录音和系统自带声音。试听与勾选分开，可以一次选择多个声音，再逐个完成转译。"}
    >
      <div className="capture-origin" aria-label="首页已选择的采集方式">
        <span>ACT I · 入口选择完成</span>
        <strong>{entry === "diary" ? diaryCapture === "upload" ? "🖼️ 上传声卡照片" : "📷 拍摄纸质声卡" : captureMode === "library" ? "🎧 从声音库拾取" : "🎙️ 现场录音"}</strong>
        <button type="button" onClick={() => router.push("/")}>重新选择 →</button>
      </div>

      <div className={`capture-grid capture-grid--${entry === "diary" ? "diary" : captureMode}`}>
        {entry === "diary" ? (
          <section className="capture-stage capture-stage--card">
            <div className="capture-stage__top"><span>{diaryCapture === "upload" ? "UPLOAD / 声卡上传" : "CAMERA / 声卡拍摄"}</span><b>固定版式 V1</b></div>
            <div className={`diary-preview ${cardImageUrl ? "diary-preview--photo" : "diary-preview--empty"}`}>
              <i className="diary-preview__corner diary-preview__corner--one" /><i className="diary-preview__corner diary-preview__corner--two" />
              {/* Blob/data previews cannot use Next Image's build-time optimization pipeline. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {cardImageUrl ? <img src={cardImageUrl} alt="待采样与转译的纸质声卡" /> : <><b>没有检测到声卡照片</b><span>请返回首页，完成拍摄或照片选择后再进入。</span></>}
            </div>
            <div className="capture-stage__selection"><strong>{acquiredCardImage ? diaryCapture === "upload" ? "🖼️ 照片已从相册载入" : "📷 拍摄照片已载入" : "照片尚未准备好"}</strong><em>{acquiredCardImage ? `${acquiredCardImage.fileName} · ${Math.max(1, Math.round(acquiredCardImage.size / 1024))} KB` : "采样与转译入口保持锁定"}</em></div>
          </section>
        ) : captureMode === "record" ? (
          <section className="capture-stage capture-stage--record">
            <div className="capture-stage__top"><span>RECORDER / 环境采集</span><b className={recordingState === "recording" ? "is-recording" : ""}>{recordingState === "recording" ? `正在录音 ${Math.ceil(recordingDurationMs / 1000)} / ${MAX_RECORDING_DURATION_MS / 1000} 秒` : recorded ? `${Math.max(1, Math.round(recordingDurationMs / 1000))} 秒` : `最长 ${MAX_RECORDING_DURATION_MS / 1000} 秒`}</b></div>
            <LiveWaveform stream={recordingState === "recording" ? liveStream : null} />
            {/* 环境声音没有语言字幕轨；控件保留可见的中文名称。 */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            {recordedUrl && <audio ref={recordPreviewRef} className="record-preview" src={recordedUrl} controls aria-label="试听刚录下的声音" />}
            <button className="record-button" onClick={recordingState === "recording" ? stopRecording : startRecording}><span>{recordingState === "recording" ? "■" : recorded ? "↺" : "●"}</span>{recordingState === "recording" ? "停止录音" : recorded ? "重新录一段" : "开始录音"}</button>
            <p className="capture-stage__hint">{recordingState === "error" ? "麦克风没有打开。请检查权限，再试一次。" : `单段录音最长 ${MAX_RECORDING_DURATION_MS / 1000} 秒，到时自动停止；保存后始终完整播放。`}</p>
            <div className="capture-upload">
              <label className="capture-upload__button">上传音频文件<input type="file" accept={AUDIO_UPLOAD_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void receiveAudioFile(file); }} /></label>
              <p role="status">{uploadNotice ?? `也可以从这台设备选择已有音频。单个音源最长 ${MAX_INGEST_DURATION_SECONDS} 秒，超过时会先请你截取一段再保存。`}</p>
            </div>
          </section>
        ) : null}

        {(entry === "diary" || captureMode === "record") && <section className="capture-draft" aria-label="声音档案信息">
          <div className="capture-draft__head"><span>PROVENANCE / 声音档案</span><b>{entry === "diary" ? `声音 ${activePaperEntry + 1}` : captureMode === "record" ? "录音草稿" : "声音库条目"}</b></div>
          <label>声音名称<input value={entry === "diary" ? paperNames[activePaperEntry] ?? "" : captureName} onChange={(event) => entry === "diary" ? setPaperNames((current) => ({ ...current, [activePaperEntry]: event.target.value })) : setCaptureName(event.target.value)} placeholder={entry === "diary" ? "例如：牛、风、苹果落地" : "给这段声音起个名字"} /></label>
          <label>孩子姓名<input list="capture-contributor-names" value={contributorName} onChange={(event) => setContributorName(event.target.value)} placeholder="选择已有姓名或直接输入" /><datalist id="capture-contributor-names">{contributorNames.map((name) => <option value={name} key={name} />)}</datalist></label>
          <label>日期<input type="date" value={captureDate} onChange={(event) => setCaptureDate(event.target.value)} /></label>
          <label>地点<input value={capturePlace} onChange={(event) => setCapturePlace(event.target.value)} placeholder="例如：学校后山" /></label>
          <p>{normalizedContributorName && capturePlace ? `将记入「${normalizedContributorName} · ${capturePlace}」的本地档案。` : "补齐孩子姓名和地点后，才能形成可追溯的声音。"}</p>
        </section>}

        {(entry === "diary" || captureMode === "library") && <section className="capture-library">
          <div className="capture-library__head"><div><span>{entry === "diary" ? "READ ENTRIES" : "SOUND LIBRARY"}</span><h2>{entry === "diary" ? "已填写的声音" : "我的录音与系统声音"}</h2></div><b>{entry === "diary" ? readEntries ? `${filledEntries.length} FILLED` : "READING" : `已选 ${selectedLibraryCardIds.length} / ${recordings.length + systemCards.length}`}</b></div>
          {entry === "record" ? <div className="capture-library__groups">
            <details className="capture-library-group" open>
              <summary><span><strong>历史声音</strong><small>你保存到这台设备的声音</small></span><em>{recordings.length}</em></summary>
              <div className="capture-library__list">
              {recordings.length === 0 && <div className="capture-library__empty capture-library__empty--compact"><b>还没有历史声音</b><span>录制并保存后会出现在这里。</span></div>}
              {recordings.map((recording, index) => (
              <div className={`capture-library__item ${selectedLibraryCardIds.includes(`card-${recording.id}`) ? "is-selected" : ""}`} key={recording.id}>
                <button type="button" className="capture-library__select" aria-pressed={selectedLibraryCardIds.includes(`card-${recording.id}`)} aria-label={`${selectedLibraryCardIds.includes(`card-${recording.id}`) ? "取消选择" : "选择"}${recording.name}`} onClick={() => toggleLibraryCard(`card-${recording.id}`, recording.id)}>{selectedLibraryCardIds.includes(`card-${recording.id}`) ? "✓" : ""}</button>
                <button className="capture-library__play" onClick={() => { selectRecording(recording.id); void playStoredRecording(recording.id); }} aria-label={`${playingRecordingId === recording.id ? "暂停" : "播放"}${recording.name}`}><span className="capture-library__index">{playingRecordingId === recording.id ? "❚❚" : String(index + 1).padStart(2, "0")}</span><span className="capture-entry-emoji" aria-hidden="true">🌟</span></button>
                <span className="capture-library__info">{editingItem === recording.id ? <input ref={editInputRef} value={editingName} onChange={(event) => setEditingName(event.target.value)} onBlur={() => void finishRename()} onKeyDown={(event) => { if (event.key === "Enter") void finishRename(); if (event.key === "Escape") setEditingItem(null); }} aria-label="编辑声音名字" /> : <button onClick={() => { selectRecording(recording.id); void playStoredRecording(recording.id); }}><strong>{recording.name}</strong><small>{recording.contributorName} · {recording.place}</small></button>}</span><em>我的录音</em>
                <button className="capture-library__more" onClick={() => { setOpenItemMenu(openItemMenu === recording.id ? null : recording.id); setConfirmDeleteItem(null); }} aria-label={`编辑${recording.name}`}>•••</button>
                {openItemMenu === recording.id && <span className="capture-library__menu"><button onClick={() => beginRename(recording.id, recording.name)}>改名字</button><button className={confirmDeleteItem === recording.id ? "is-danger" : ""} onClick={() => void requestDelete(recording.id)}>{confirmDeleteItem === recording.id ? "确认删除" : "删除"}</button></span>}
              </div>
              ))}
              </div>
            </details>
            <details className="capture-library-group" open>
              <summary><span><strong>系统声音</strong><small>随应用提供，不会被历史操作删除</small></span><em>{systemCards.length}</em></summary>
              <div className="capture-library__list">
              {systemCards.map((card, index) => (
                <div className={`capture-library__item capture-library__item--system ${selectedLibraryCardIds.includes(card.id) ? "is-selected" : ""}`} key={card.id}>
                  <button type="button" className="capture-library__select" aria-pressed={selectedLibraryCardIds.includes(card.id)} aria-label={`${selectedLibraryCardIds.includes(card.id) ? "取消选择" : "选择"}${card.source.label}`} onClick={() => toggleLibraryCard(card.id)}>{selectedLibraryCardIds.includes(card.id) ? "✓" : ""}</button>
                  <button className="capture-library__play" onClick={() => playSystemCard(card.id)} aria-label={`${playback.status === "playing" && playback.activeSoundUnitIds.includes(`unit-${card.id}`) ? "暂停" : "播放"}${card.source.label}`}><span className="capture-library__index">S{String(index + 1).padStart(2, "0")}</span><SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} size="small" /></button>
                  <span className="capture-library__info"><button onClick={() => playSystemCard(card.id)}><strong>{card.source.label}</strong><small>{card.owner} · {card.place}</small></button></span><em>系统自带</em>
                </div>
              ))}
              </div>
            </details>
          </div> : <div className="capture-library__list">
            {filledEntries.map((item) => (
              <button className={item.entryIndex === activePaperEntry ? "is-selected" : ""} onClick={() => setActivePaperEntry(item.entryIndex)} key={item.entryIndex}>
                <span className="capture-library__index">{String(item.entryIndex + 1).padStart(2, "0")}</span>
                <span className="capture-entry-emoji" aria-hidden="true">📝</span>
                <span><strong>声音 {item.entryIndex + 1}</strong><small>{fieldSummary(item)} · {item.confidence === "high" ? "圈选清楚" : "请老师复核"}</small></span>
                <em>已填写</em>
              </button>
            ))}
            {entry === "diary" && readEntries && filledEntries.length === 0 && <div className="capture-library__empty"><b>这张声卡好像还在想答案</b><span>没有找到已填写的声音。请换一张照片，或由老师手动建立声音。</span></div>}
          </div>}
          {/* 环境声音没有语言字幕轨；播放器仅作为不可见的原声引擎。 */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          {entry === "record" && <audio ref={libraryAudioRef} hidden aria-label="声音库原声播放器" />}
        </section>}
      </div>

      {uploadCandidate && <AudioTrimDialog
        fileName={uploadCandidate.fileName}
        playbackUrl={uploadCandidate.url}
        sourceDurationSeconds={uploadCandidate.sourceDurationSeconds}
        defaultSelection={uploadCandidate.selection}
        busy={trimming}
        onCancel={closeUploadCandidate}
        onConfirm={(selection) => void confirmUploadTrim(selection)}
      />}

      <div className="atlas-navfoot">
        <button onClick={() => router.push("/")}>← <span>返回入口选择 / BACK</span></button>
        <button className="atlas-navfoot__next" disabled={captureMode === "record" && entry === "record" ? !recordedBlob || !captureName.trim() || !normalizedContributorName || !capturePlace.trim() || !captureDate : captureMode === "library" && entry === "record" ? selectedLibraryCardIds.length === 0 : (entry === "diary" && (!acquiredCardImage || filledEntries.length === 0)) || (entry === "diary" && (!filledEntries.every((item) => paperNames[item.entryIndex]?.trim()) || !normalizedContributorName || !capturePlace.trim() || !captureDate))} onClick={captureMode === "record" && entry === "record" ? saveCurrentRecording : next}>
          <span>{entry === "diary" ? "读取这张声音日记" : captureMode === "record" ? "保存进声音库" : selectedLibraryCardIds.length ? `转译所选 ${selectedLibraryCardIds.length} 个声音` : "请先选择声音"}</span> →
        </button>
      </div>
    </PageShell>
  );
}

function fileBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").slice(0, 24) || "上传的声音";
}

function fieldSummary(entry: ReadPaperCardEntry) {
  return [
    entry.pitch && FIELD_LABELS.pitch[entry.pitch],
    entry.duration && FIELD_LABELS.duration[entry.duration],
    entry.contour && FIELD_LABELS.contour[entry.contour],
    entry.intensity && FIELD_LABELS.intensity[entry.intensity],
    entry.pattern && FIELD_LABELS.pattern[entry.pattern],
  ].map((label) => label || "待确认").join(" · ");
}
