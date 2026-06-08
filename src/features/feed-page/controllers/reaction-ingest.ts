import { useEffect } from "react";
import { NostrEventKind, type NostrEventWithRelay } from "@/lib/nostr/types";
import {
  mergeReactionEvents,
  setReactionsViewerPubkey,
} from "@/features/feed-page/stores/reactions-registry";

/**
 * The Nostr kinds the reaction concern opts into. Index unions these into the
 * single hydration-tuned subscription so reactions and their NIP-09 deletions
 * are backfilled and live-updated alongside every other concern — no parallel
 * subscription, no reaction logic inlined into Index.
 */
export const REACTION_INGEST_KINDS = [
  NostrEventKind.Reaction,
  NostrEventKind.EventDeletion,
] as const;

/**
 * Fold a single incoming reaction/deletion event into the registry. Only kinds
 * 7/5 are routed here by Index; `mergeReactionEvents` filters internally, so a
 * kind-5 deletion that targets a post (not a reaction) is a safe no-op.
 */
export function handleReactionEvent(event: NostrEventWithRelay): void {
  mergeReactionEvents([event]);
}

/** Keep the registry's "mine" slice in sync with the signed-in viewer. */
export function useReactionViewerSync(pubkey: string | undefined): void {
  useEffect(() => {
    setReactionsViewerPubkey(pubkey);
  }, [pubkey]);
}
