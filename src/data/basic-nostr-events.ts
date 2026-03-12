import { NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";

export const BASIC_FIXTURE_RELAY_URL = "wss://demo";

const BASIC_FIXTURE_TEXT_PUBKEY = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
const BASIC_FIXTURE_TASK_PUBKEY = "466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27";
const BASIC_FIXTURE_LISTING_PUBKEY = "3c72addb4fdf09af94f0c94d7fe92a386a7e70cf8a1d85916386bb2535c7b1b1";

export const basicNostrEvents: NostrEventWithRelay[] = [
  {
    id: "eac20d967ee67e0c04d799327476d6f2222ee64e597faa72353e41c0a7c66152",
    pubkey: BASIC_FIXTURE_TEXT_PUBKEY,
    created_at: 1704067200, // 2024-01-01 00:00:00 UTC
    kind: NostrEventKind.TextNote,
    tags: [["t", "general"]],
    content: "Nameless hello from relay fixture #general",
    sig: "bf3d9ca9158ecfa1fa6dde7287fb2253d6045574a6b53f112c090ab7222f2105a31c55260dbd8bb890f2ef00dea92b1394340e90b60a11f12d267964696baa48",
    relayUrl: BASIC_FIXTURE_RELAY_URL,
  },
  {
    id: "032ddf51dc6d4cd51aba04459e82bde33a88f306559bd7aedf18a522ac8002c2",
    pubkey: BASIC_FIXTURE_TASK_PUBKEY,
    created_at: 1704067260, // 2024-01-01 00:01:00 UTC
    kind: NostrEventKind.Task,
    tags: [["t", "demo"], ["status", "todo"]],
    content: "Nameless fixture task #demo",
    sig: "c6a8b2eab38b44adc99d10c985ad0bfc999cd881045f4d1784e781902dcdbb988f39e7e9fb659f0dc1020e788444cff776322436cdf280c202ad92245462d86b",
    relayUrl: BASIC_FIXTURE_RELAY_URL,
  },
  {
    id: "80f8136c674d449b5ba40af1e83a377a57e3c3069d02247dcfc11c8a5b58ccc1",
    pubkey: BASIC_FIXTURE_LISTING_PUBKEY,
    created_at: 1704067320, // 2024-01-01 00:02:00 UTC
    kind: NostrEventKind.ClassifiedListing,
    tags: [["d", "fixture-listing"], ["type", "request"], ["t", "market"]],
    content: "Need help with moving boxes #market",
    sig: "140419438baa5c3048878a08654ea812189ce2151469758c80c841cd4804be5294f24085ebd50d8f1db8a76ce7fea12664fccb4d3b4d7311b2790981049af525",
    relayUrl: BASIC_FIXTURE_RELAY_URL,
  },
];

export function cloneBasicNostrEvents(): NostrEventWithRelay[] {
  return basicNostrEvents.map((event) => ({
    ...event,
    tags: event.tags.map((tag) => [...tag]),
  }));
}
