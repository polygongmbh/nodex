import type { Person } from "@/types";

const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;
const NIP05_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const NPUB_PATTERN = /^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/i;

export function normalizeMentionIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[.,!?;:]+$/g, "");
}

export function extractMentionIdentifiersFromContent(content: string): string[] {
  const mentionPattern = /@([a-zA-Z0-9._-]+(?:@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})?)/g;
  const normalized = Array.from(content.matchAll(mentionPattern))
    .map((match) => normalizeMentionIdentifier(match[1] || ""))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function getPreferredMentionIdentifier(person: Person): string {
  const normalizedNip05 = normalizeMentionIdentifier(person.nip05 || "");
  if (NIP05_PATTERN.test(normalizedNip05)) {
    return normalizedNip05;
  }

  const normalizedId = normalizeMentionIdentifier(person.id);
  if (PUBKEY_PATTERN.test(normalizedId)) {
    return normalizedId;
  }

  return normalizedId || normalizeMentionIdentifier(person.name) || normalizeMentionIdentifier(person.displayName);
}

export function getMentionAliases(person: Person): string[] {
  const aliases = new Set<string>();
  const push = (value?: string) => {
    const normalized = normalizeMentionIdentifier(value || "");
    if (normalized) aliases.add(normalized);
  };

  push(person.id);
  push(person.name);
  push(person.displayName);
  push(person.nip05);

  const nip05 = normalizeMentionIdentifier(person.nip05 || "");
  if (nip05.includes("@")) {
    push(nip05.split("@")[0]);
  }

  return Array.from(aliases);
}

export function personMatchesMentionQuery(person: Person, query: string): boolean {
  const normalizedQuery = normalizeMentionIdentifier(query);
  if (!normalizedQuery) return true;
  return getMentionAliases(person).some((alias) => alias.includes(normalizedQuery));
}

export function resolveMentionedPubkeys(content: string, people: Person[]): string[] {
  const mentionIdentifiers = extractMentionIdentifiersFromContent(content);
  if (mentionIdentifiers.length === 0) return [];

  const resolved = new Set<string>();

  for (const mentionIdentifier of mentionIdentifiers) {
    if (PUBKEY_PATTERN.test(mentionIdentifier)) {
      resolved.add(mentionIdentifier);
    }
  }

  for (const person of people) {
    const pubkey = normalizeMentionIdentifier(person.id);
    if (!PUBKEY_PATTERN.test(pubkey)) continue;
    const aliases = new Set(getMentionAliases(person));
    if (mentionIdentifiers.some((identifier) => aliases.has(identifier))) {
      resolved.add(pubkey);
    }
  }

  return Array.from(resolved);
}

export function formatMentionIdentifierForDisplay(identifier: string): string {
  const normalized = normalizeMentionIdentifier(identifier);
  if (PUBKEY_PATTERN.test(normalized) || NPUB_PATTERN.test(normalized)) {
    if (normalized.length <= 18) return normalized;
    return `${normalized.slice(0, 10)}…${normalized.slice(-6)}`;
  }
  return normalized;
}
