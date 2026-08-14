import { describe, expect, it } from "vitest";
import { ActiveSoundTracker } from "./ActiveSoundTracker";

describe("ActiveSoundTracker", () => {
  it("keeps overlapping sound units active independently", () => {
    const tracker = new ActiveSoundTracker();
    expect(tracker.activate("wind")).toEqual(["wind"]);
    expect(tracker.activate("cow")).toEqual(["wind", "cow"]);
    expect(tracker.deactivate("wind")).toEqual(["cow"]);
  });

  it("keeps one sound active until all of its overlapping events end", () => {
    const tracker = new ActiveSoundTracker();
    tracker.activate("bird");
    tracker.activate("bird");
    expect(tracker.deactivate("bird")).toEqual(["bird"]);
    expect(tracker.deactivate("bird")).toEqual([]);
  });
});
