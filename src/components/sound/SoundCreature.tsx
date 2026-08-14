import type { CreatureKind } from "@/src/mocks/mockData";

const EMOJI_BY_KIND: Record<CreatureKind, string> = {
  rain: "🌬️",
  cow: "🐄",
  bell: "🚲",
  steps: "🍎",
};

export function SoundCreature({ kind, color, accent, active = false, size = "medium", label }: { kind: CreatureKind; color: string; accent: string; active?: boolean; size?: "small" | "medium" | "large"; label?: string }) {
  return (
    <div className={`sound-creature sound-creature--${kind} sound-creature--${size} ${active ? "is-active" : ""}`} style={{ "--creature-color": color, "--creature-accent": accent } as React.CSSProperties} aria-label={label} role={label ? "img" : undefined}>
      <span className="sound-creature__emoji" aria-hidden="true">{EMOJI_BY_KIND[kind]}</span>
      <span className="sound-creature__shadow" aria-hidden="true" />
      {active && <span className="sound-creature__waves" aria-hidden="true"><i /><i /><i /></span>}
    </div>
  );
}
