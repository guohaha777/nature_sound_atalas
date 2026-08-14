export type CameraFailureKind = "desktop" | "unsupported" | "denied" | "missing" | "busy" | "unknown";

export const CAMERA_FAILURE_COPY: Record<CameraFailureKind, string> = {
  desktop: "电脑更擅长整理照片，不太会举起声卡拍照。请从相册选一张；换到手机或平板时，相机会出来帮忙！",
  unsupported: "这台设备的相机正在躲猫猫。没关系，我们从相册请一张声卡出来吧！",
  denied: "相机有点害羞，还没拿到开门票。可以允许相机，或者从相册选一张声卡。",
  missing: "没有找到相机小伙伴。换成相册也能继续，一点都不耽误！",
  busy: "相机正在忙着给别的应用拍照。先请它休息一下，或者从相册继续。",
  unknown: "相机刚刚打了个小喷嚏，没有打开。我们可以再试一次，或者去相册找照片。",
};

export interface MobileDeviceHint {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
}

export function isMobileCaptureDevice(device: MobileDeviceHint): boolean {
  if (device.userAgentData?.mobile === true) return true;
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(device.userAgent)) return true;
  return device.platform === "MacIntel" && (device.maxTouchPoints ?? 0) > 1;
}

export function classifyCameraFailure(error: unknown): CameraFailureKind {
  if (!(error instanceof DOMException)) return "unknown";
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "denied";
  if (error.name === "NotFoundError" || error.name === "OverconstrainedError") return "missing";
  if (error.name === "NotReadableError" || error.name === "AbortError") return "busy";
  return "unknown";
}
