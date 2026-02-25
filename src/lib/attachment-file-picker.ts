const IOS_DEVICE_REGEX = /iPad|iPhone|iPod/i;
const MOBILE_USER_AGENT_REGEX = /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i;
const DESKTOP_PLATFORM_REGEX = /Win|Mac|Linux|X11|CrOS/i;

export type AttachmentPickerMode = "separate" | "unified";

// Excludes image MIME types so iOS can show a distinct non-photo file chooser.
export const NON_IMAGE_ATTACHMENT_ACCEPT = "application/*,text/*,audio/*,video/*";

function isIOSPlatform(): boolean {
  if (typeof navigator === "undefined") return false;

  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  const isIPadOSDesktopUA = /Mac/i.test(platform) && touchPoints > 1;

  return IOS_DEVICE_REGEX.test(userAgent) || isIPadOSDesktopUA;
}

function isLikelyDesktopPlatform(): boolean {
  if (typeof navigator === "undefined") return true;

  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const isDesktopPlatform = DESKTOP_PLATFORM_REGEX.test(platform);
  const isMobileUserAgent = MOBILE_USER_AGENT_REGEX.test(userAgent);

  return isDesktopPlatform && !isMobileUserAgent && !isIOSPlatform();
}

export function shouldPreferNonImageFilePickerOnIOS(): boolean {
  return isIOSPlatform();
}

export function getAttachmentPickerMode(): AttachmentPickerMode {
  if (isIOSPlatform()) return "separate";
  if (isLikelyDesktopPlatform()) return "separate";
  return "unified";
}
