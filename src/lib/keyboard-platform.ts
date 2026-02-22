export function isMacOSPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  return /(mac|iphone|ipad|ipod)/i.test(`${platform} ${userAgent}`);
}

export function getAlternateModifierLabel(): string {
  return isMacOSPlatform() ? "Option" : "Alt";
}

export function getSubmitCurrentKindShortcutLabel(): string {
  return isMacOSPlatform() ? "Cmd + Enter" : "Ctrl + Enter";
}

export function getSubmitOppositeKindShortcutLabel(): string {
  return `${getAlternateModifierLabel()} + Enter`;
}

export function getMetadataOnlyShortcutLabel(): string {
  return "Any modifier + Enter / Click";
}
