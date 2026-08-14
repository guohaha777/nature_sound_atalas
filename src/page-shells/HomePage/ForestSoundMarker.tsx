import type { ForestSoundMock } from "@/src/mocks/homePageMockData";

export function ForestSoundMarker({ sound, active, onToggle }: { sound: ForestSoundMock; active: boolean; onToggle(): void }) {
  return (
    <button
      className={`forest-sound forest-sound--${sound.position}${active ? " is-playing" : ""}`}
      type="button"
      aria-label={`${sound.accessibleLabel}${active ? "，点击暂停" : ""}`}
      aria-pressed={active}
      onClick={onToggle}
    >
      <span className="forest-sound__pulse" aria-hidden="true"><i /><i /><i /></span>
      <span className="forest-sound__label">{sound.label}</span>
    </button>
  );
}
