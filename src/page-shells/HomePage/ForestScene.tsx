/* eslint-disable @next/next/no-img-element -- These transparent SVG layers share one coordinate system and need direct stacking. */
"use client";

import { useEffect, useRef, useState } from "react";
import { HOME_PAGE_MOCK } from "@/src/mocks/homePageMockData";
import { ForestSoundMarker } from "./ForestSoundMarker";

const CLOUDS = ["one", "two", "three"] as const;
const APPLES = ["one", "two", "three"] as const;

export function ForestScene() {
  const audioElementsRef = useRef(new Map<string, HTMLAudioElement>());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);

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

      {CLOUDS.map((cloud) => (
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
    </div>
  );
}
