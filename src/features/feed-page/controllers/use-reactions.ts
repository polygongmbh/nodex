import { useCallback } from "react";
import { NDKKind, type NDKEvent, type NDKSubscription } from "@nostr-dev-kit/ndk";
import type NDK from "@nostr-dev-kit/ndk";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  REACTION_EVENT_KIND,
  buildReactionTags,
  normalizeReactionContent,
} from "@/infrastructure/nostr/reaction-events";
import { buildDeletionTags } from "@/infrastructure/nostr/deletion-events";
import { publishWithFeedback } from "@/lib/nostr/publish-with-feedback";
import { resolveTargetPostRelayUrls } from "@/infrastructure/nostr/relay-url";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import {
  notifyNeedSigninReact,
  notifyReactionFailed,
  notifyReactionRemoveFailed,
} from "@/lib/notifications";
import {
  getReactionsForTarget,
  mergeReactionEvents,
} from "@/features/feed-page/stores/reactions-registry";

const FETCH_TTL_MS = 60_000;
// Coalesce the mount burst: every visible card calls ensureFetched on mount, so
// a short window collects them all into one merged REQ instead of one per card.
const FLUSH_DELAY_MS = 50;
// A fetch sub must stop even if the relay never EOSEs (auth-gated relays answer
// a signed-out REQ with CLOSED, which NDK does not count toward EOSE — the sub
// would otherwise leak in subManager forever).
const REACTION_FETCH_TIMEOUT_MS = 5_000;
// NIP-01 filters can hold many #e values, but relays cap REQ size; chunk to stay
// well within typical limits.
const MAX_TARGETS_PER_REQ = 500;

// Module-scoped so the 60s dedup and the pending batch are global across every
// card's own useReactions(); a per-hook map would let virtualized remounts
// refetch-storm the same targets.
const lastFetchAtByTargetId = new Map<string, number>();
const pendingTargetIds = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function mergeReactionNdkEvents(events: NDKEvent[]): void {
  if (events.length === 0) return;
  mergeReactionEvents(
    events.map((ndkEvent) => ({
      id: ndkEvent.id,
      pubkey: ndkEvent.pubkey,
      kind: ndkEvent.kind ?? REACTION_EVENT_KIND,
      tags: ndkEvent.tags,
      content: ndkEvent.content,
    })),
  );
}

/**
 * Backfill reactions for a batch of target post ids with a single managed
 * subscription. Unlike ndk.fetchEvents (no timeout, no CLOSED handling), this
 * always stops the sub — on EOSE, on relay CLOSED, or after a timeout — so a
 * relay that never EOSEs can't leak a subscription. On a non-EOSE end the
 * targets are un-stamped so a later mount can retry rather than being
 * TTL-locked to a fetch that never completed.
 */
function fetchReactionsForTargets(ndk: NDK, targetIds: string[]): void {
  if (targetIds.length === 0) return;
  const buffer: NDKEvent[] = [];
  const sub: NDKSubscription = ndk.subscribe(
    [{ kinds: [NDKKind.Reaction], "#e": targetIds }],
    // We merged the per-target filters into one REQ ourselves; NDK grouping
    // would not merge #e arrays (it refuses to union limit-bearing filters and
    // this one is already merged), so grouping only adds latency here.
    { closeOnEose: true, groupable: false },
  );

  let settled = false;
  const finish = (didEose: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    sub.stop();
    mergeReactionNdkEvents(buffer);
    if (!didEose) {
      // The fetch did not complete cleanly; allow a retry on the next mount.
      targetIds.forEach((id) => lastFetchAtByTargetId.delete(id));
    }
  };

  const timeoutId = setTimeout(() => finish(false), REACTION_FETCH_TIMEOUT_MS);
  sub.on("event", (event: NDKEvent) => buffer.push(event));
  sub.on("eose", () => finish(true));
  sub.on("closed", () => finish(false));
}

function flushReactionFetches(ndk: NDK): void {
  flushTimer = null;
  if (pendingTargetIds.size === 0) return;
  const ids = Array.from(pendingTargetIds);
  pendingTargetIds.clear();
  for (let i = 0; i < ids.length; i += MAX_TARGETS_PER_REQ) {
    fetchReactionsForTargets(ndk, ids.slice(i, i + MAX_TARGETS_PER_REQ));
  }
}

interface ReactionTarget {
  id: string;
  kind: number;
  pubkey: string;
  // The reacted-to post's relay ids (domain data straight off the Task). A reaction is a child of
  // that post, so the hook resolves these to URLs and publishes there; the transport layer can't do
  // this itself (it has no relay id->url registry and no knowledge of the parent post).
  relayIds: string[];
}

export function useReactions() {
  const { ndk, user, publishEvent } = useNDK();
  const { relays } = useFeedSurfaceState();

  const react = useCallback(async (
    target: ReactionTarget,
    rawContent: string,
  ): Promise<boolean> => {
    if (!user?.pubkey) {
      notifyNeedSigninReact();
      return false;
    }
    const content = normalizeReactionContent(rawContent);
    if (!content) return false;

    const relayUrls = resolveTargetPostRelayUrls(relays, target.relayIds);
    const result = await publishWithFeedback(publishEvent, {
      kind: NostrEventKind.Reaction,
      content,
      tags: buildReactionTags(target, relayUrls?.[0] ?? ""),
      relayUrls,
    }, "[reactions] publish");
    if (!result.success) {
      notifyReactionFailed(result.rejectionReason);
      return false;
    }
    return true;
  }, [user?.pubkey, publishEvent, relays]);

  const ensureFetched = useCallback((targetEventId: string): void => {
    if (!ndk || !targetEventId) return;
    const lastAt = lastFetchAtByTargetId.get(targetEventId);
    if (lastAt && Date.now() - lastAt < FETCH_TTL_MS) return;
    lastFetchAtByTargetId.set(targetEventId, Date.now());
    pendingTargetIds.add(targetEventId);
    if (flushTimer === null) {
      flushTimer = setTimeout(() => flushReactionFetches(ndk), FLUSH_DELAY_MS);
    }
  }, [ndk]);

  const unreact = useCallback(async (
    targetEventId: string,
    rawContent: string,
    targetRelayIds: string[],
  ): Promise<boolean> => {
    if (!user?.pubkey) {
      notifyNeedSigninReact();
      return false;
    }
    const emoji = normalizeReactionContent(rawContent);
    if (!emoji) return false;

    const matchingIds = getReactionsForTarget(targetEventId)?.mineEventIdsByEmoji[emoji] ?? [];
    if (matchingIds.length === 0) return false;

    const relayUrls = resolveTargetPostRelayUrls(relays, targetRelayIds);
    const result = await publishWithFeedback(publishEvent, {
      kind: NostrEventKind.EventDeletion,
      content: "",
      tags: matchingIds.flatMap((id) => buildDeletionTags({ id, kind: REACTION_EVENT_KIND })),
      relayUrls,
    }, "[reactions] deletion");
    if (!result.success) {
      notifyReactionRemoveFailed();
      return false;
    }
    return true;
  }, [user?.pubkey, publishEvent, relays]);

  return { react, unreact, ensureReactionsFetched: ensureFetched };
}
