import type { LucideIcon } from "lucide-react";
import { Building2, Cpu, Gamepad2, PlayCircle, Radio, RadioTower, Rss, Users, ListTodo } from "lucide-react";
import { normalizeRelayUrl } from "./relay-url";

const PREFIX_ICON_MAP: Record<string, LucideIcon> = {
  demo: PlayCircle,
  feed: Rss,
  tasks: ListTodo,
  base: Building2,
  relay: RadioTower,
  nostr: Cpu,
};

const HASH_FALLBACK_ICONS: LucideIcon[] = [
  Building2,
  Users,
  Gamepad2,
  Cpu,
  Radio,
];

function extractRelayHostPrefix(url: string): string {
  const normalized = normalizeRelayUrl(url);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    return parsed.hostname.split(".").filter(Boolean)[0]?.toLowerCase() ?? "";
  } catch {
    const noProtocol = normalized.replace(/^[a-z]+:\/\//i, "");
    return noProtocol.split(/[./:?#]/).filter(Boolean)[0]?.toLowerCase() ?? "";
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function resolveRelayIcon(url: string): LucideIcon {
  const prefix = extractRelayHostPrefix(url);
  const mapped = prefix ? PREFIX_ICON_MAP[prefix] : undefined;
  if (mapped) return mapped;

  const fallbackSeed = prefix || normalizeRelayUrl(url).toLowerCase();
  return HASH_FALLBACK_ICONS[hashString(fallbackSeed) % HASH_FALLBACK_ICONS.length];
}

