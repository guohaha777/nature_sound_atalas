"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { CAMERA_FAILURE_COPY, classifyCameraFailure, isMobileCaptureDevice, type CameraFailureKind } from "@/src/features/capture/cameraAvailability";
import { HOME_PAGE_MOCK, type HomeEntranceId, type HomeEntrySource } from "@/src/mocks/homePageMockData";

type CameraStatus = "idle" | "opening" | "ready" | "failed";

export function HomeEntryDialog({ entry, onClose, onContinue }: { entry: HomeEntranceId; onClose(): void; onContinue(source: HomeEntrySource, file?: File): void | Promise<void> }) {
  const dialog = HOME_PAGE_MOCK.entryDialogs[entry];
  const [selected, setSelected] = useState<HomeEntrySource>(dialog.options[0].id);
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraFailure, setCameraFailure] = useState<CameraFailureKind | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!chosenFile) return;
    const reader = new FileReader();
    const receivePreview = () => setPreviewUrl(typeof reader.result === "string" ? reader.result : null);
    reader.addEventListener("load", receivePreview);
    reader.readAsDataURL(chosenFile);
    return () => {
      reader.removeEventListener("load", receivePreview);
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [chosenFile]);

  useEffect(() => {
    if (!cameraStream || !videoRef.current) return;
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play().catch(() => undefined);
    return () => cameraStream.getTracks().forEach((track) => track.stop());
  }, [cameraStream]);

  const stopCamera = () => {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  };

  const openCamera = async () => {
    stopCamera();
    setChosenFile(null);
    setPreviewUrl(null);
    setCameraFailure(null);
    if (!isMobileCaptureDevice(navigator)) {
      setCameraStatus("failed");
      setCameraFailure("desktop");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("failed");
      setCameraFailure("unsupported");
      return;
    }
    setCameraStatus("opening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setCameraStream(stream);
      setCameraStatus("ready");
    } catch (error) {
      setCameraStatus("failed");
      setCameraFailure(classifyCameraFailure(error));
    }
  };

  const openAlbum = () => {
    stopCamera();
    setSelected("upload");
    setChosenFile(null);
    setPreviewUrl(null);
    const input = uploadInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setChosenFile(new File([blob], `sound-card-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
      stopCamera();
      setCameraStatus("idle");
    }, "image/jpeg", 0.9);
  };

  const chooseOption = (source: HomeEntrySource) => {
    setSelected(source);
    if (entry === "record") {
      void onContinue(source);
      return;
    }
    if (source === "camera") void openCamera();
    else openAlbum();
  };

  const receiveImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setCameraStatus("idle");
    setChosenFile(file);
  };

  const continueWithImage = async () => {
    if (!chosenFile || submitting) return;
    setSubmitting(true);
    await onContinue(selected, chosenFile);
    setSubmitting(false);
  };

  return (
    <div className="home-entry-dialog__backdrop">
      <button className="home-entry-dialog__dismiss" type="button" aria-label="关闭选择弹窗" onClick={onClose} />
      <section className="home-entry-dialog" role="dialog" aria-modal="true" aria-labelledby="home-entry-dialog-title">
        <header className="home-entry-dialog__head">
          <div><span>{dialog.eyebrow}</span><h2 id="home-entry-dialog-title">{dialog.title}</h2></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭选择弹窗">×</button>
        </header>
        <p className="home-entry-dialog__description">{dialog.description}</p>
        <div className="home-entry-dialog__options" role="radiogroup" aria-label={dialog.title}>
          {dialog.options.map((option, index) => (
            <button
              className={selected === option.id ? "is-selected" : ""}
              type="button"
              role="radio"
              aria-checked={selected === option.id}
              onClick={() => chooseOption(option.id)}
              key={option.id}
            >
              <span className="home-entry-dialog__index">{String(index + 1).padStart(2, "0")}</span>
              <span className="home-entry-dialog__emoji" aria-hidden="true">{option.emoji}</span>
              <span><strong>{option.title}</strong><small>{option.englishTitle}</small><em>{option.description}</em></span>
              <b aria-hidden="true">{selected === option.id ? "●" : "○"}</b>
            </button>
          ))}
        </div>
        {entry === "diary" && (
          <div className={`home-entry-dialog__file ${chosenFile ? "is-ready" : ""} ${cameraStatus !== "idle" ? "is-camera" : ""}`} aria-live="polite">
            {selected === "camera" && cameraStatus === "opening" && <div className="home-entry-dialog__camera-message"><b>相机正在伸懒腰…</b><span>马上就准备好。</span></div>}
            {selected === "camera" && cameraStatus === "ready" && <div className="home-entry-dialog__camera"><video ref={videoRef} muted playsInline aria-label="相机实时画面" /><button type="button" onClick={takePhoto}>📷 拍下这张声卡</button></div>}
            {selected === "camera" && cameraStatus === "failed" && <div className="home-entry-dialog__camera-message"><b>{CAMERA_FAILURE_COPY[cameraFailure ?? "unknown"]}</b><span><button type="button" onClick={openCamera}>再试一次</button><button type="button" onClick={openAlbum}>从相册找一张</button></span></div>}
            {/* Blob/data previews cannot use Next Image's build-time optimization pipeline. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cameraStatus === "idle" && chosenFile && previewUrl && <img src={previewUrl} alt="已选择的声卡照片预览" />}
            {cameraStatus === "idle" && <span>
              <strong>{chosenFile ? "照片已经准备好" : "先拍摄或选择一张声卡照片"}</strong>
              <small>{chosenFile ? `${chosenFile.name || "声卡照片"} · ${Math.max(1, Math.round(chosenFile.size / 1024))} KB` : "成功取得图片后，才可以进入采样与转译。"}</small>
            </span>}
            {cameraStatus === "idle" && <b aria-hidden="true">{chosenFile ? "✓" : "…"}</b>}
          </div>
        )}
        <input ref={uploadInputRef} className="home-entry-dialog__input" type="file" accept="image/*" onChange={receiveImage} />
        <footer className={`home-entry-dialog__foot ${entry === "record" ? "home-entry-dialog__foot--single" : ""}`}>
          <button type="button" onClick={onClose}>返回首页</button>
          {entry === "diary" && <button type="button" disabled={!chosenFile || submitting} onClick={continueWithImage}><span>{submitting ? "正在保存照片…" : dialog.actionLabel}</span> →</button>}
        </footer>
      </section>
    </div>
  );
}
