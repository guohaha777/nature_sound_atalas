import type { MockSoundCard } from "@/src/mocks/mockData";
import { FIELD_LABELS } from "@/src/domain/sound-card";
import { SoundCreature } from "@/src/components/sound";

export function SoundCardPreview({ card, selected = false, onClick }: { card: MockSoundCard; selected?: boolean; onClick?: () => void }) {
  return (
    <button className={`sound-card ${selected ? "is-selected" : ""}`} onClick={onClick} aria-pressed={selected}>
      <div className="sound-card__visual" style={{ "--card-wash": `${card.color}42` } as React.CSSProperties}>
        <span className="mock-ribbon">MOCK</span>
        <SoundCreature kind={card.creatureKind} color={card.color} accent={card.accent} size="small" label={`${card.source.label}声音生命体`} />
      </div>
      <div className="sound-card__copy">
        <span className="eyebrow">示例声卡 · 儿童记录</span>
        <h3>{card.source.label}</h3>
        <p>{card.childNote}</p>
        <div className="field-chips" aria-label="声音配方摘要">
          <span>{FIELD_LABELS.pitch[card.pitch]}</span>
          <span>{FIELD_LABELS.duration[card.duration]}</span>
          <span>{FIELD_LABELS.contour[card.contour]}</span>
          <span>{FIELD_LABELS.pattern[card.pattern]}</span>
        </div>
      </div>
    </button>
  );
}
