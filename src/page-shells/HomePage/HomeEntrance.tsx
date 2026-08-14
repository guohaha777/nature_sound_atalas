import type { HomeEntranceMock } from "@/src/mocks/homePageMockData";

export function HomeEntrance({ entrance, description, onSelect }: { entrance: HomeEntranceMock; description?: string; onSelect(): void }) {
  return (
    <button className="home-entrance" type="button" onClick={onSelect}>
      <span className="home-entrance__index">{entrance.index}</span>
      <span className="home-entrance__main">
        <span className={`home-entrance__icon home-entrance__icon--${entrance.icon}`} aria-hidden="true"><i /></span>
        <span className="home-entrance__content">
          <strong>{entrance.title}</strong>
          <small>{entrance.englishTitle}</small>
          <em>{description ?? entrance.description}</em>
        </span>
      </span>
      <span className="home-entrance__arrow" aria-hidden="true">→</span>
    </button>
  );
}
