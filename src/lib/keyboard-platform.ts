export function isMacOSPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  return /(mac|iphone|ipad|ipod)/i.test(`${platform} ${userAgent}`);
}

export function getAlternateModifierHintKey(): "hints.modifiers.alt" | "hints.modifiers.optionAlt" {
  return isMacOSPlatform() ? "hints.modifiers.optionAlt" : "hints.modifiers.alt";
}

export function getSubmitCurrentKindShortcutLabel(): string {
  return isMacOSPlatform() ? "Cmd + Enter" : "Ctrl + Enter";
}

export function getSubmitOppositeKindShortcutLabel(): string {
  return isMacOSPlatform() ? "Option + Enter" : "Alt + Enter";
}

export function getMetadataOnlyShortcutLabel(): string {
  return isMacOSPlatform() ? "Option/Cmd/Shift + Enter" : "Alt/Ctrl/Shift + Enter";
}
