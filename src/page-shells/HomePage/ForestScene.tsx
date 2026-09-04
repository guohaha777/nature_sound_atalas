/* eslint-disable @next/next/no-img-element -- These transparent SVG layers share one coordinate system and need direct stacking. */
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HOME_PAGE_MOCK } from "@/src/mocks/homePageMockData";
import { ForestSoundMarker } from "./ForestSoundMarker";

const CLOUDS = ["one", "two", "three"] as const;
const APPLES = ["one", "two", "three"] as const;
/** 临时：承担视频播放键的那朵云。 */
const VIDEO_CLOUD = "three";

export function ForestScene() {
  const audioElementsRef = useRef(new Map<string, HTMLAudioElement>());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  /** 临时演示视频：把其中一朵云做成播放键。正式项目上线前连同 public/temp 一起删除。 */
  const [videoOpen, setVideoOpen] = useState(false);

  useEffect(() => () => {
    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      audio.onended = null;
      audio.onerror = null;
    });
    activeAudioRef.current = null;
  }, []);

  const toggleSound = (soundId: string) => {
    const audio = audioElementsRef.current.get(soundId);
    if (!audio) return;

    if (activeSoundId === soundId) {
      audio.pause();
      setActiveSoundId(null);
      return;
    }

    if (activeAudioRef.current === audio && audio.paused && audio.currentTime > 0 && !audio.ended) {
      setActiveSoundId(soundId);
      void audio.play().catch(() => clearAudio(audio));
      return;
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
    }
    const clearIfCurrent = () => {
      if (activeAudioRef.current !== audio) return;
      activeAudioRef.current = null;
      setActiveSoundId(null);
    };
    audio.currentTime = 0;
    audio.onended = clearIfCurrent;
    audio.onerror = clearIfCurrent;
    activeAudioRef.current = audio;
    setActiveSoundId(soundId);
    void audio.play().catch(() => {
      clearIfCurrent();
    });
  };

  const clearAudio = (audio: HTMLAudioElement) => {
    if (activeAudioRef.current !== audio) return;
    activeAudioRef.current = null;
    setActiveSoundId(null);
  };

  return (
    <div className="forest-home__art">
      <span className="forest-home__sun" aria-hidden="true" />

      {CLOUDS.map((cloud) => cloud === VIDEO_CLOUD ? (
        // 临时演示入口：这朵云是可点的，其余两朵仍是纯装饰。
        <button
          className={`forest-home__cloud forest-home__cloud--${cloud} forest-home__cloud--playable`}
          onClick={() => setVideoOpen(true)}
          aria-label="播放项目介绍视频"
          key={cloud}
          type="button"
        >
          <img src="/cloud-transparent.svg" width="1024" height="1024" alt="" aria-hidden="true" />
          <span className="forest-home__cloud-play" aria-hidden="true">▶</span>
        </button>
      ) : (
        <img
          className={`forest-home__cloud forest-home__cloud--${cloud}`}
          src="/cloud-transparent.svg"
          width="1024"
          height="1024"
          alt=""
          aria-hidden="true"
          key={cloud}
        />
      ))}

      <div className="forest-home__left-grove" aria-hidden="true">
        <img className="forest-home__left-grove-tree" src="/homepage-art/tree.svg" width="1024" height="1024" alt="" />
        <img className="forest-home__left-grove-plants" src="/homepage-art/foreground-plants.svg" width="1024" height="1024" alt="" />
      </div>

      <div className="forest-home__woodland" aria-hidden="true">
        <img className="forest-home__forest" src="/homepage-art/forest.svg" width="1024" height="1024" alt="" />
        {APPLES.map((apple) => (
          <img
            className={`forest-home__apple forest-home__apple--${apple}`}
            src="/homepage-art/apple.svg"
            width="1024"
            height="1024"
            alt=""
            key={apple}
          />
        ))}
      </div>

      {HOME_PAGE_MOCK.sounds.map((sound) => (
        <span key={sound.id}>
          {/* Sound effects do not contain speech, so captions are not applicable. */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            className="forest-home__preload"
            ref={(node) => {
              if (node) audioElementsRef.current.set(sound.id, node);
              else audioElementsRef.current.delete(sound.id);
            }}
            src={sound.audioSrc}
            preload="auto"
          />
          <ForestSoundMarker
            sound={sound}
            active={activeSoundId === sound.id}
            onToggle={() => toggleSound(sound.id)}
          />
        </span>
      ))}

      {/*
        临时演示视频弹窗。必须挂到 body，不能留在这一层：
        .forest-home__art 是 pointer-events:none 且 z-index:1 自成层叠上下文，
        留在里面的话弹窗既点不动、又会被页面上层元素盖住。
        正式项目删除时，连同上面的 VIDEO_CLOUD 分支和 public/temp 一起去掉。
      */}
      {videoOpen && createPortal(
        <div className="home-video-backdrop">
          {/* 点背景关闭：用按钮承载，键盘和读屏都能触达，不给非交互元素挂点击。 */}
          <button className="home-video-dismiss" onClick={() => setVideoOpen(false)} aria-label="关闭视频" type="button" />
          <div className="home-video-dialog" role="dialog" aria-modal="true" aria-label="项目介绍视频">
            <button className="home-video-close" onClick={() => setVideoOpen(false)} aria-label="关闭视频" type="button">×</button>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- 临时演示片，正式项目会补字幕轨 */}
            <video src="/temp/intro-video.mp4" controls autoPlay playsInline preload="metadata" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
