const IOS_DEVICE_REGEX = /iPad|iPhone|iPod/i;

// Excludes image MIME types so iOS can show a distinct non-photo file chooser.
export const NON_IMAGE_ATTACHMENT_ACCEPT = "application/*,text/*,audio/*,video/*";

export function shouldPreferNonImageFilePickerOnIOS(): boolean {
  if (typeof navigator === "undefined") return false;

  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const touchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  const isIPadOSDesktopUA = /Mac/i.test(platform) && touchPoints > 1;

  return IOS_DEVICE_REGEX.test(userAgent) || isIPadOSDesktopUA;
}
