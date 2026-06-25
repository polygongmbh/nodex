import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";

export type PersonShortcutIntent =
  | "person.filter.exclusive"
  | "person.filter.toggle"
  | "person.compose.mention"
  | "person.filterAndMention";

interface PersonShortcutModifierState {
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function getPersonShortcutIntent(
  event: PersonShortcutModifierState,
): PersonShortcutIntent | null {
  const hasPrimaryModifier = Boolean(event.metaKey || event.ctrlKey);
  const hasAlternateModifier = Boolean(event.altKey);

  if (hasPrimaryModifier && hasAlternateModifier) return "person.filterAndMention";
  if (hasPrimaryModifier) return "person.filter.exclusive";
  if (hasAlternateModifier) return "person.compose.mention";
  if (event.shiftKey) return "person.filter.toggle";

  return null;
}

export function toPersonShortcutInteraction(
  pubkey: string,
  intent: PersonShortcutIntent,
): FeedInteractionIntent {
  switch (intent) {
    case "person.filter.exclusive":
      return { type: "person.filter.exclusive", pubkey };
    case "person.filter.toggle":
      return { type: "person.filter.toggle", pubkey };
    case "person.compose.mention":
      return { type: "person.compose.mention", pubkey };
    case "person.filterAndMention":
      return { type: "person.filterAndMention", pubkey };
  }
}

export function getPlatformPrimaryShortcutLabel() {
  return typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "Cmd" : "Ctrl";
}

export function getPlatformAlternateShortcutLabel() {
  return typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "Opt" : "Alt";
}
