export function isMacOSPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  return /(mac|iphone|ipad|ipod)/i.test(`${platform} ${userAgent}`);
}
