import type { Person } from "@/types/person";
import { MENTION_CONTENT_REGEX } from "@/lib/content-tokens";
import {
  formatUserFacingPubkey,
  isHexPubkey,
  isNpub,
  npubToHexPubkey,
  toUserFacingPubkey,
} from "@/lib/nostr/user-facing-pubkey";

const NIP05_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizeMentionIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[.,!?;:]+$/g, "");
}

export function extractMentionIdentifiersFromContent(content: string): string[] {
  const normalized = Array.from(content.matchAll(MENTION_CONTENT_REGEX))
    .map((match) => normalizeMentionIdentifier(match[2] || ""))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function normalizeMentionIdentifiers(mentionIdentifiers: string[]): string[] {
  return Array.from(
    new Set(
      mentionIdentifiers
        .map((identifier) => normalizeMentionIdentifier(identifier))
        .filter(Boolean)
    )
  );
}

export function getPreferredMentionIdentifier(person: Person): string {
  const normalizedNip05 = normalizeMentionIdentifier(person.nip05 || "");
  if (NIP05_PATTERN.test(normalizedNip05)) {
    return normalizedNip05;
  }

  const normalizedId = normalizeMentionIdentifier(person.id);
  if (isHexPubkey(normalizedId) || isNpub(normalizedId)) {
    return toUserFacingPubkey(normalizedId);
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
  const userFacingPubkey = toUserFacingPubkey(person.id || "");
  if (isNpub(userFacingPubkey)) {
    push(userFacingPubkey);
  }

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
  return resolveMentionIdentifiersToPubkeys(extractMentionIdentifiersFromContent(content), people);
}

export function resolveMentionIdentifiersToPubkeys(
  mentionIdentifiers: string[],
  people: Person[]
): string[] {
  const normalizedMentionIdentifiers = normalizeMentionIdentifiers(mentionIdentifiers);
  if (normalizedMentionIdentifiers.length === 0) return [];

  const resolved = new Set<string>();

  for (const mentionIdentifier of normalizedMentionIdentifiers) {
    if (isHexPubkey(mentionIdentifier)) {
      resolved.add(mentionIdentifier);
      continue;
    }

    const decodedNpub = npubToHexPubkey(mentionIdentifier);
    if (decodedNpub) {
      resolved.add(decodedNpub);
    }
  }

  for (const person of people) {
    const normalizedPersonId = normalizeMentionIdentifier(person.id);
    const pubkey = isHexPubkey(normalizedPersonId)
      ? normalizedPersonId
      : npubToHexPubkey(normalizedPersonId);
    if (!pubkey) continue;
    const aliases = new Set(getMentionAliases(person));
    if (normalizedMentionIdentifiers.some((identifier) => aliases.has(identifier))) {
      resolved.add(pubkey);
    }
  }

  return Array.from(resolved);
}

interface ResolveMentionedPubkeysAsyncOptions {
  resolveNip05: (identifier: string) => Promise<string | null>;
}

export async function resolveMentionIdentifiersToPubkeysAsync(
  mentionIdentifiers: string[],
  people: Person[],
  options: ResolveMentionedPubkeysAsyncOptions
): Promise<string[]> {
  const normalizedMentionIdentifiers = normalizeMentionIdentifiers(mentionIdentifiers);
  if (normalizedMentionIdentifiers.length === 0) return [];

  const resolved = new Set(resolveMentionIdentifiersToPubkeys(normalizedMentionIdentifiers, people));
  const unresolvedNip05 = normalizedMentionIdentifiers.filter((identifier) => {
    if (!NIP05_PATTERN.test(identifier)) return false;
    return true;
  });

  if (unresolvedNip05.length === 0) {
    return Array.from(resolved);
  }

  const lookupResults = await Promise.all(
    unresolvedNip05.map(async (identifier) => {
      try {
        return await options.resolveNip05(identifier);
      } catch {
        return null;
      }
    })
  );
  lookupResults.forEach((pubkey) => {
    const normalized = normalizeMentionIdentifier(pubkey || "");
    if (isHexPubkey(normalized)) {
      resolved.add(normalized);
      return;
    }
    const decodedNpub = npubToHexPubkey(normalized);
    if (decodedNpub) {
      resolved.add(decodedNpub);
    }
  });

  return Array.from(resolved);
}

export async function resolveMentionedPubkeysAsync(
  content: string,
  people: Person[],
  options: ResolveMentionedPubkeysAsyncOptions
): Promise<string[]> {
  return resolveMentionIdentifiersToPubkeysAsync(
    extractMentionIdentifiersFromContent(content),
    people,
    options
  );
}

export function formatMentionIdentifierForDisplay(identifier: string): string {
  const normalized = normalizeMentionIdentifier(identifier);
  const userFacing = toUserFacingPubkey(normalized);
  if (isHexPubkey(normalized) || isNpub(userFacing)) {
    return formatUserFacingPubkey(userFacing, { prefix: 10, suffix: 6, ellipsis: "…" });
  }
  return normalized;
}
