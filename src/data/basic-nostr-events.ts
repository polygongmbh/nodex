import { NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";

export const BASIC_FIXTURE_RELAY_URL = "wss://demo";

const BASIC_FIXTURE_TEXT_PUBKEY = "1111111111111111111111111111111111111111111111111111111111111111";
const BASIC_FIXTURE_TASK_PUBKEY = "2222222222222222222222222222222222222222222222222222222222222222";
const BASIC_FIXTURE_LISTING_PUBKEY = "3333333333333333333333333333333333333333333333333333333333333333";

function repeatHex(seed: string, length: number): string {
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

export const basicNostrEvents: NostrEventWithRelay[] = [
  {
    id: repeatHex("a1", 64),
    pubkey: BASIC_FIXTURE_TEXT_PUBKEY,
    created_at: 1704067200, // 2024-01-01 00:00:00 UTC
    kind: NostrEventKind.TextNote,
    tags: [["t", "general"]],
    content: "Nameless hello from relay fixture #general",
    sig: repeatHex("a", 128),
    relayUrl: BASIC_FIXTURE_RELAY_URL,
  },
  {
    id: repeatHex("b2", 64),
    pubkey: BASIC_FIXTURE_TASK_PUBKEY,
    created_at: 1704067260, // 2024-01-01 00:01:00 UTC
    kind: NostrEventKind.Task,
    tags: [["t", "demo"], ["status", "todo"]],
    content: "Nameless fixture task #demo",
    sig: repeatHex("b", 128),
    relayUrl: BASIC_FIXTURE_RELAY_URL,
  },
  {
    id: repeatHex("c3", 64),
    pubkey: BASIC_FIXTURE_LISTING_PUBKEY,
    created_at: 1704067320, // 2024-01-01 00:02:00 UTC
    kind: NostrEventKind.ClassifiedListing,
    tags: [["d", "fixture-listing"], ["type", "request"], ["t", "market"]],
    content: "Need help with moving boxes #market",
    sig: repeatHex("c", 128),
    relayUrl: BASIC_FIXTURE_RELAY_URL,
  },
];

export function cloneBasicNostrEvents(): NostrEventWithRelay[] {
  return basicNostrEvents.map((event) => ({
    ...event,
    tags: event.tags.map((tag) => [...tag]),
  }));
}
