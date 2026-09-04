import { describe, expect, it } from "vitest";
import { librarySelectionProgress, nextSelectedCardId, parseLibrarySelection, selectedLibraryUnitIds, serializeLibrarySelection } from "./librarySelection";

describe("library selection flow", () => {
  it("keeps a stable, unique queue of safe card ids", () => {
    expect(parseLibrarySelection("card-cow,card-recording-1,card-cow,../world")).toEqual(["card-cow", "card-recording-1"]);
    expect(serializeLibrarySelection(["card-cow", "card-recording-1", "card-cow"])).toBe("card-cow,card-recording-1");
  });

  it("moves through confirmation and birth in selection order", () => {
    const ids = ["card-wind", "card-cow", "card-bird"];
    expect(nextSelectedCardId(ids, "card-wind")).toBe("card-cow");
    expect(nextSelectedCardId(ids, "card-bird")).toBeNull();
    expect(librarySelectionProgress(ids, "card-cow")).toEqual({ index: 1, total: 3 });
  });

  it("activates every selected card when entering the sound world", () => {
    expect(selectedLibraryUnitIds(
      ["card-wind", "card-cow"],
      [{ id: "unit-wind", cardId: "card-wind" }, { id: "unit-cow", cardId: "card-cow" }, { id: "unit-bird", cardId: "card-bird" }],
    )).toEqual(["unit-wind", "unit-cow"]);
  });
});
