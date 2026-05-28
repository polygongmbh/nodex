import { useSyncExternalStore } from "react";
import {
  isBatchingNotifications,
  registerStoreFlusher,
} from "@/lib/store-batch";

// Authors-we-have-seen-on-the-wire projection used by the people list.
// Replaces the union over a raw-event array; the dispatcher calls
// noteSeenPubkey for every event regardless of kind, so reactors and
// presence/profile authors land here too — not just post authors.

const seenPubkeys = new Set<string>();
const subscribers = new Set<() => void>();
let version = 0;
let cachedSnapshot: string[] = [];
let cachedSnapshotAtVersion = -1;

let batchedNotifyPending = false;
registerStoreFlusher(() => {
  if (!batchedNotifyPending) return;
  batchedNotifyPending = false;
  for (const subscriber of subscribers) subscriber();
});

function notifyChange(): void {
  version += 1;
  if (isBatchingNotifications()) {
    batchedNotifyPending = true;
    return;
  }
  for (const subscriber of subscribers) subscriber();
}

export function noteSeenPubkey(pubkey: string | undefined): void {
  if (!pubkey) return;
  const normalized = pubkey.trim().toLowerCase();
  if (!normalized) return;
  if (seenPubkeys.has(normalized)) return;
  seenPubkeys.add(normalized);
  notifyChange();
}

export function getSeenPubkeys(): string[] {
  if (cachedSnapshotAtVersion === version) return cachedSnapshot;
  cachedSnapshot = Array.from(seenPubkeys);
  cachedSnapshotAtVersion = version;
  return cachedSnapshot;
}

export function getSeenPubkeysVersion(): number {
  return version;
}

export function subscribeToSeenPubkeys(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function useSeenPubkeys(): string[] {
  useSyncExternalStore(subscribeToSeenPubkeys, getSeenPubkeysVersion, getSeenPubkeysVersion);
  return getSeenPubkeys();
}

export function __resetSeenPubkeysForTests(): void {
  seenPubkeys.clear();
  cachedSnapshot = [];
  cachedSnapshotAtVersion = -1;
  version = 0;
  subscribers.clear();
  batchedNotifyPending = false;
}
