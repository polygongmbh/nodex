import { nip19, nip27 } from "nostr-tools";

export type ParsedNostrContentReference =
  | {
    type: "profile";
    pubkey: string;
    relays: string[];
  }
  | {
    type: "event";
    eventId: string;
    relays: string[];
    author?: string;
    kind?: number;
  }
  | {
    type: "address";
    kind: number;
    pubkey: string;
    identifier: string;
    relays: string[];
  };

const BARE_NIP19_TOKEN_REGEX = /(?:^|[^A-Za-z0-9])((?:npub1|nprofile1|note1|nevent1|naddr1)[023456789acdefghjklmnpqrstuvwxyz]+)/gi;

function pushUniqueReference(
  refs: ParsedNostrContentReference[],
  seen: Set<string>,
  reference: ParsedNostrContentReference
): void {
  const key = reference.type === "profile"
    ? `profile:${reference.pubkey}`
    : reference.type === "event"
      ? `event:${reference.eventId}`
      : `address:${reference.kind}:${reference.pubkey}:${reference.identifier}`;
  if (seen.has(key)) return;
  seen.add(key);
  refs.push(reference);
}

function normalizeRelayList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
    .filter(Boolean);
}

function collectFromDecoded(
  decoded: ReturnType<typeof nip19.decode>,
  refs: ParsedNostrContentReference[],
  seen: Set<string>
): void {
  if (decoded.type === "npub") {
    pushUniqueReference(refs, seen, {
      type: "profile",
      pubkey: decoded.data.toLowerCase(),
      relays: [],
    });
    return;
  }

  if (decoded.type === "note") {
    pushUniqueReference(refs, seen, {
      type: "event",
      eventId: decoded.data.toLowerCase(),
      relays: [],
    });
    return;
  }

  if (decoded.type === "nprofile") {
    pushUniqueReference(refs, seen, {
      type: "profile",
      pubkey: decoded.data.pubkey.toLowerCase(),
      relays: normalizeRelayList(decoded.data.relays),
    });
    return;
  }

  if (decoded.type === "nevent") {
    pushUniqueReference(refs, seen, {
      type: "event",
      eventId: decoded.data.id.toLowerCase(),
      relays: normalizeRelayList(decoded.data.relays),
      author: decoded.data.author?.toLowerCase(),
      kind: decoded.data.kind,
    });
    return;
  }

  if (decoded.type === "naddr") {
    pushUniqueReference(refs, seen, {
      type: "address",
      kind: decoded.data.kind,
      pubkey: decoded.data.pubkey.toLowerCase(),
      identifier: decoded.data.identifier,
      relays: normalizeRelayList(decoded.data.relays),
    });
  }
}

export function extractNostrContentReferences(content: string): ParsedNostrContentReference[] {
  const refs: ParsedNostrContentReference[] = [];
  const seen = new Set<string>();

  for (const block of nip27.parse(content)) {
    if (block.type !== "reference") continue;
    const pointer = block.pointer as Record<string, unknown>;
    if (
      typeof pointer.kind === "number"
      && typeof pointer.pubkey === "string"
      && typeof pointer.identifier === "string"
    ) {
      pushUniqueReference(refs, seen, {
        type: "address",
        kind: pointer.kind,
        pubkey: pointer.pubkey.toLowerCase(),
        identifier: pointer.identifier,
        relays: normalizeRelayList(pointer.relays),
      });
      continue;
    }

    if (typeof pointer.id === "string") {
      pushUniqueReference(refs, seen, {
        type: "event",
        eventId: pointer.id.toLowerCase(),
        relays: normalizeRelayList(pointer.relays),
        author: typeof pointer.author === "string" ? pointer.author.toLowerCase() : undefined,
        kind: typeof pointer.kind === "number" ? pointer.kind : undefined,
      });
      continue;
    }

    if (typeof pointer.pubkey === "string") {
      pushUniqueReference(refs, seen, {
        type: "profile",
        pubkey: pointer.pubkey.toLowerCase(),
        relays: normalizeRelayList(pointer.relays),
      });
    }
  }

  for (const match of content.matchAll(BARE_NIP19_TOKEN_REGEX)) {
    const token = (match[1] || "").trim();
    if (!token) continue;
    try {
      const decoded = nip19.decode(token);
      collectFromDecoded(decoded, refs, seen);
    } catch {
      // Ignore invalid NIP-19 tokens in free-form text.
    }
  }

  return refs;
}

export function extractNostrReferenceTagsFromContent(content: string): string[][] {
  const references = extractNostrContentReferences(content);
  const tags = new Map<string, string[]>();

  references.forEach((reference) => {
    if (reference.type === "profile") {
      tags.set(`p:${reference.pubkey}`, ["p", reference.pubkey]);
      return;
    }

    if (reference.type === "event") {
      tags.set(`e:${reference.eventId}`, ["e", reference.eventId]);
      return;
    }

    const address = `${reference.kind}:${reference.pubkey}:${reference.identifier}`;
    tags.set(`a:${address}`, ["a", address]);
  });

  return Array.from(tags.values());
}
