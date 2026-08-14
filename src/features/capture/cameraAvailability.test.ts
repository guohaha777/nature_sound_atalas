import { describe, expect, it } from "vitest";
import { classifyCameraFailure, isMobileCaptureDevice } from "./cameraAvailability";

describe("classifyCameraFailure", () => {
  it("separates permission, missing-device and busy-device failures", () => {
    expect(classifyCameraFailure(new DOMException("no", "NotAllowedError"))).toBe("denied");
    expect(classifyCameraFailure(new DOMException("none", "NotFoundError"))).toBe("missing");
    expect(classifyCameraFailure(new DOMException("busy", "NotReadableError"))).toBe("busy");
  });

  it("starts camera capture only for mobile and touch iPad-class devices", () => {
    expect(isMobileCaptureDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isMobileCaptureDevice({ userAgent: "Mozilla/5.0", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileCaptureDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });
});
