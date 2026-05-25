import { NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";

export const DEMO_RELAY_URL = "ws://Demo";

const BASIC_FIXTURE_TEXT_PUBKEY = "47e23cb6b7b82234245471753986e4692494ff1f0f365561c3e2d46a17f12299";
const BASIC_FIXTURE_TASK_PUBKEY = "3657988b28984cc10225897871afe368303dad2077c03614a1d4eda659bdf1ad";
const BASIC_FIXTURE_LISTING_PUBKEY = "de0340f81e3761624da6c8ea3f686e0c4d4ef2a3b7ce8e2abf796e0948417ae0";

export const basicNostrEvents: NostrEventWithRelay[] = [
  {
    id: "6224b4c5999052981eef6419c150404b12538097e1ec1f6a7a0dfea354bc0e88",
    pubkey: BASIC_FIXTURE_TEXT_PUBKEY,
    created_at: 1704067200, // 2024-01-01 00:00:00 UTC
    kind: NostrEventKind.TextNote,
    tags: [["t", "general"]],
    content: "Nameless hello from relay fixture #general",
    sig: "8769bccd3a01f1612340a3df7740ac33f3d351e19c25ced8b4976254246b3ebce5f790ab855e5c179a5babba5243f4267687a90c94e60328db14485c34e46227",
    relayUrls: [DEMO_RELAY_URL],
  },
  {
    id: "dd2bcf2dc8397470ccf4f76b12d45d7896d61a1db40189232b2e9ddb9a591f65",
    pubkey: BASIC_FIXTURE_TASK_PUBKEY,
    created_at: 1704067260, // 2024-01-01 00:01:00 UTC
    kind: NostrEventKind.Task,
    tags: [["t", "demo"]],
    content: "Nameless fixture task #demo",
    sig: "e9914c0371904540701e32215c4a431cd2db720b56e9b730d7a9060a3d0bf5501f39b8671976ae3a35c4c28041230a8293073d1e118a393d4ad24abb7aaa2f1f",
    relayUrls: [DEMO_RELAY_URL],
  },
  {
    id: "4a9a002bcaccd1c67dd54e21d5cd46c1c92e97bbc7fc83898e4703fd5000d119",
    pubkey: BASIC_FIXTURE_LISTING_PUBKEY,
    created_at: 1704067320, // 2024-01-01 00:02:00 UTC
    kind: NostrEventKind.ClassifiedListing,
    tags: [["d", "fixture-listing"], ["type", "request"], ["t", "market"]],
    content: "Need help with moving boxes #market",
    sig: "d86d568d0f05a0b829a4afd83b2820b0173890c8891e927a2d2cf7060f749d5c49ebfef9903245fdaa349974c0dca75c91041f7ffdf291f7153809e6428a7ceb",
    relayUrls: [DEMO_RELAY_URL],
  },
];
