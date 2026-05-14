import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { NDKKind } from "@nostr-dev-kit/ndk";
import { toast } from "sonner";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { NOSTR_EVENTS_QUERY_KEY } from "@/infrastructure/nostr/use-nostr-event-cache";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  REACTION_EVENT_KIND,
  buildReactionTags,
  normalizeReactionContent,
} from "@/infrastructure/nostr/reaction-events";
import { buildDeletionTags } from "@/infrastructure/nostr/deletion-events";

const FETCH_TTL_MS = 60_000;
const FETCH_LIMIT = 200;

interface ReactionTarget {
  id: string;
  kind: number;
  pubkey: string;
}

function appendReactionToCache(
  queryClient: ReturnType<typeof useQueryClient>,
  event: CachedNostrEvent,
): void {
  queryClient.setQueriesData<CachedNostrEvent[]>(
    { queryKey: NOSTR_EVENTS_QUERY_KEY },
    (previous = []) => {
      if (previous.some((existing) => existing.id === event.id)) return previous;
      return [...previous, event];
    },
  );
}

export function useReactions() {
  const { ndk, user, publishEvent } = useNDK();
  const queryClient = useQueryClient();
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

    const tags = buildReactionTags(target);
    const optimisticId = `reaction-pending-${user.pubkey}-${target.id}-${content}`;
    const now = Math.floor(Date.now() / 1000);
    appendReactionToCache(queryClient, {
      id: optimisticId,
      pubkey: user.pubkey,
      created_at: now,
      kind: REACTION_EVENT_KIND,
      tags,
      content,
    });

    try {
      const result = await publishEvent(NostrEventKind.Reaction, content, tags);
      if (!result.success) {
        console.warn("[reactions] publish reported no success", { eventId: result.eventId });
        return false;
      }
      if (result.eventId && result.eventId !== optimisticId) {
        queryClient.setQueriesData<CachedNostrEvent[]>(
          { queryKey: NOSTR_EVENTS_QUERY_KEY },
          (previous = []) => previous.map((event) => (event.id === optimisticId ? {
            ...event,
            id: result.eventId!,
            relayUrls: result.publishedRelayUrls,
          } : event)),
        );
      }
      return true;
    } catch (error) {
      console.warn("[reactions] publish failed", error);
      queryClient.setQueriesData<CachedNostrEvent[]>(
        { queryKey: NOSTR_EVENTS_QUERY_KEY },
        (previous = []) => previous.filter((event) => event.id !== optimisticId),
      );
      return false;
    }
  }, [user?.pubkey, publishEvent, queryClient]);

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
      for (const ndkEvent of events) {
        const relayUrls = ndkEvent.onRelays?.map((r) => r.url).filter(Boolean) ?? [];
        appendReactionToCache(queryClient, {
          id: ndkEvent.id,
          pubkey: ndkEvent.pubkey,
          created_at: ndkEvent.created_at ?? Math.floor(Date.now() / 1000),
          kind: ndkEvent.kind ?? REACTION_EVENT_KIND,
          tags: ndkEvent.tags,
          content: ndkEvent.content,
          sig: ndkEvent.sig,
          relayUrls,
        });
      }
    } catch (error) {
      console.warn("[reactions] on-demand fetch failed", { targetEventId, error });
    }
  }, [ndk, queryClient]);

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

    // Find the viewer's reaction events for (target, emoji) in the cache.
    const cached = queryClient.getQueriesData<CachedNostrEvent[]>({ queryKey: NOSTR_EVENTS_QUERY_KEY });
    const matching: CachedNostrEvent[] = [];
    const seen = new Set<string>();
    for (const [, events] of cached) {
      if (!events) continue;
      for (const event of events) {
        if (event.kind !== REACTION_EVENT_KIND) continue;
        if (event.pubkey !== user.pubkey) continue;
        if (seen.has(event.id)) continue;
        const targetId = (() => {
          for (let i = event.tags.length - 1; i >= 0; i--) {
            const tag = event.tags[i];
            if (tag[0]?.toLowerCase() === "e" && tag[1]) return tag[1];
          }
          return undefined;
        })();
        if (targetId !== targetEventId) continue;
        if (normalizeReactionContent(event.content) !== emoji) continue;
        seen.add(event.id);
        matching.push(event);
      }
    }
    if (matching.length === 0) return false;

    const matchingIds = new Set(matching.map((event) => event.id));
    const removeFromCache = () => {
      queryClient.setQueriesData<CachedNostrEvent[]>(
        { queryKey: NOSTR_EVENTS_QUERY_KEY },
        (previous = []) => previous.filter((event) => !matchingIds.has(event.id)),
      );
    };
    const restoreCache = () => {
      queryClient.setQueriesData<CachedNostrEvent[]>(
        { queryKey: NOSTR_EVENTS_QUERY_KEY },
        (previous = []) => {
          const present = new Set(previous.map((event) => event.id));
          const toRestore = matching.filter((event) => !present.has(event.id));
          if (toRestore.length === 0) return previous;
          return [...previous, ...toRestore];
        },
      );
    };

    // Optimistically clear so the UI updates immediately.
    removeFromCache();

    // Only publish deletions for confirmed reactions (skip optimistic ids
    // that never made it to a relay — removing them from cache is enough).
    const confirmed = matching.filter((event) => !event.id.startsWith("reaction-pending-"));
    if (confirmed.length === 0) return true;

    try {
      const tags: string[][] = confirmed.flatMap((event) =>
        buildDeletionTags({ id: event.id, kind: event.kind }),
      );
      const result = await publishEvent(NostrEventKind.EventDeletion, "", tags);
      if (!result.success) {
        console.warn("[reactions] deletion publish reported no success", { targetEventId, emoji });
        restoreCache();
        return false;
      }
      return true;
    } catch (error) {
      console.warn("[reactions] deletion publish failed", { targetEventId, emoji, error });
      restoreCache();
      return false;
    }
  }, [user?.pubkey, publishEvent, queryClient]);

  return { react, unreact, ensureReactionsFetched: ensureFetched };
}
