import { useCallback } from "react";
import { NDKKind } from "@nostr-dev-kit/ndk";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  REACTION_EVENT_KIND,
  buildReactionTags,
  normalizeReactionContent,
} from "@/infrastructure/nostr/reaction-events";
import { buildDeletionTags } from "@/infrastructure/nostr/deletion-events";
import { publishWithFeedback } from "@/lib/nostr/publish-with-feedback";
import { resolveRelayUrlsForIds } from "@/infrastructure/nostr/relay-url";
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
const FETCH_LIMIT = 200;

// Module-scoped so the 60s dedup is global per target id. Each visible card
// mounts its own useReactions() and ensures its own reactions; a per-hook map
// would let virtualized remounts refetch-storm the same targets.
const lastFetchAtByTargetId = new Map<string, number>();

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

    const relayUrls = resolveRelayUrlsForIds(relays, target.relayIds);
    const result = await publishWithFeedback(publishEvent, {
      kind: NostrEventKind.Reaction,
      content,
      tags: buildReactionTags(target, relayUrls[0] ?? ""),
      relayUrls: relayUrls.length > 0 ? relayUrls : undefined,
    }, "[reactions] publish");
    if (!result.success) {
      notifyReactionFailed(result.rejectionReason);
      return false;
    }
    return true;
  }, [user?.pubkey, publishEvent, relays]);

  const ensureFetched = useCallback(async (targetEventId: string): Promise<void> => {
    if (!ndk || !targetEventId) return;
    const lastAt = lastFetchAtByTargetId.get(targetEventId);
    if (lastAt && Date.now() - lastAt < FETCH_TTL_MS) return;
    lastFetchAtByTargetId.set(targetEventId, Date.now());
    try {
      const events = await ndk.fetchEvents(
        { kinds: [NDKKind.Reaction], "#e": [targetEventId], limit: FETCH_LIMIT },
        { closeOnEose: true, groupable: false },
      );
      mergeReactionEvents(
        Array.from(events).map((ndkEvent) => ({
          id: ndkEvent.id,
          pubkey: ndkEvent.pubkey,
          kind: ndkEvent.kind ?? REACTION_EVENT_KIND,
          tags: ndkEvent.tags,
          content: ndkEvent.content,
        })),
      );
    } catch (error) {
      console.warn("[reactions] on-demand fetch failed", { targetEventId, error });
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

    const relayUrls = resolveRelayUrlsForIds(relays, targetRelayIds);
    const result = await publishWithFeedback(publishEvent, {
      kind: NostrEventKind.EventDeletion,
      content: "",
      tags: matchingIds.flatMap((id) => buildDeletionTags({ id, kind: REACTION_EVENT_KIND })),
      relayUrls: relayUrls.length > 0 ? relayUrls : undefined,
    }, "[reactions] deletion");
    if (!result.success) {
      notifyReactionRemoveFailed();
      return false;
    }
    return true;
  }, [user?.pubkey, publishEvent, relays]);

  return { react, unreact, ensureReactionsFetched: ensureFetched };
}
