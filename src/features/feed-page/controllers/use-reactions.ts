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
  // Relays the target post was seen on. The reaction is published here (not to
  // every active write relay) so it lands where the post actually lives.
  relayUrls?: string[];
}

export function useReactions() {
  const { ndk, user, publishEvent } = useNDK();

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

    const targetRelayUrls = target.relayUrls?.filter(Boolean) ?? [];
    const relayHint = targetRelayUrls[0] ?? "";

    try {
      const result = await publishEvent(
        NostrEventKind.Reaction,
        content,
        buildReactionTags(target, relayHint),
        undefined,
        targetRelayUrls.length > 0 ? targetRelayUrls : undefined,
      );
      if (!result.success) {
        console.warn("[reactions] publish reported no success", { eventId: result.eventId });
        notifyReactionFailed(result.rejectionReason);
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[reactions] publish failed", error);
      notifyReactionFailed();
      return false;
    }
  }, [user?.pubkey, publishEvent]);

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
    targetRelayUrls?: string[],
  ): Promise<boolean> => {
    if (!user?.pubkey) {
      notifyNeedSigninReact();
      return false;
    }
    const emoji = normalizeReactionContent(rawContent);
    if (!emoji) return false;

    const matchingIds = getReactionsForTarget(targetEventId)?.mineEventIdsByEmoji[emoji] ?? [];
    if (matchingIds.length === 0) return false;

    const relayUrls = targetRelayUrls?.filter(Boolean) ?? [];

    try {
      const tags = matchingIds.flatMap((id) =>
        buildDeletionTags({ id, kind: REACTION_EVENT_KIND }),
      );
      const result = await publishEvent(
        NostrEventKind.EventDeletion,
        "",
        tags,
        undefined,
        relayUrls.length > 0 ? relayUrls : undefined,
      );
      if (!result.success) {
        console.warn("[reactions] deletion publish reported no success", { targetEventId, emoji });
        notifyReactionRemoveFailed();
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[reactions] deletion publish failed", { targetEventId, emoji, error });
      notifyReactionRemoveFailed();
      return false;
    }
  }, [user?.pubkey, publishEvent]);

  return { react, unreact, ensureReactionsFetched: ensureFetched };
}
