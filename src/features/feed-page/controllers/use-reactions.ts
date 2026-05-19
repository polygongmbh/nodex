import { useCallback, useRef } from "react";
import { NDKKind } from "@nostr-dev-kit/ndk";
import { toast } from "sonner";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  REACTION_EVENT_KIND,
  buildReactionTags,
  normalizeReactionContent,
} from "@/infrastructure/nostr/reaction-events";
import { buildDeletionTags } from "@/infrastructure/nostr/deletion-events";
import {
  getReactionsForTarget,
  mergeReactionEvents,
} from "@/features/feed-page/stores/reactions-registry";

const FETCH_TTL_MS = 60_000;
const FETCH_LIMIT = 200;

interface ReactionTarget {
  id: string;
  kind: number;
  pubkey: string;
}

export function useReactions() {
  const { ndk, user, publishEvent } = useNDK();
  const lastFetchAtByTargetId = useRef(new Map<string, number>());

  const react = useCallback(async (
    target: ReactionTarget,
    rawContent: string,
  ): Promise<boolean> => {
    if (!user?.pubkey) {
      toast.error("Sign in to react");
      return false;
    }
    const content = normalizeReactionContent(rawContent);
    if (!content) return false;

    try {
      const result = await publishEvent(
        NostrEventKind.Reaction,
        content,
        buildReactionTags(target),
      );
      if (!result.success) {
        console.warn("[reactions] publish reported no success", { eventId: result.eventId });
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[reactions] publish failed", error);
      return false;
    }
  }, [user?.pubkey, publishEvent]);

  const ensureFetched = useCallback(async (targetEventId: string): Promise<void> => {
    if (!ndk || !targetEventId) return;
    const lastAt = lastFetchAtByTargetId.current.get(targetEventId);
    if (lastAt && Date.now() - lastAt < FETCH_TTL_MS) return;
    lastFetchAtByTargetId.current.set(targetEventId, Date.now());
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
  ): Promise<boolean> => {
    if (!user?.pubkey) {
      toast.error("Sign in to react");
      return false;
    }
    const emoji = normalizeReactionContent(rawContent);
    if (!emoji) return false;

    const matchingIds = getReactionsForTarget(targetEventId)?.mineEventIdsByEmoji[emoji] ?? [];
    if (matchingIds.length === 0) return false;

    try {
      const tags = matchingIds.flatMap((id) =>
        buildDeletionTags({ id, kind: REACTION_EVENT_KIND }),
      );
      const result = await publishEvent(NostrEventKind.EventDeletion, "", tags);
      if (!result.success) {
        console.warn("[reactions] deletion publish reported no success", { targetEventId, emoji });
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[reactions] deletion publish failed", { targetEventId, emoji, error });
      return false;
    }
  }, [user?.pubkey, publishEvent]);

  return { react, unreact, ensureReactionsFetched: ensureFetched };
}
