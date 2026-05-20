import { useCallback, useEffect, useRef, useState } from "react";
import type { NDKEvent, NDKFilter, NDKRelay, NDKSubscription } from "@nostr-dev-kit/ndk";
import { normalizeRelayUrlScope } from "@/infrastructure/nostr/relay-url";

// Subscription manager for the NDK live feed. Validates each incoming event's
// relay attribution at the wire boundary and hands it off to a per-concern
// dispatcher; downstream stores (nostr-events-store, reactions-registry,
// per-relay kind 0 cache, presence map) own their own state.

const CACHE_BOOTSTRAP_MAX_AGE_MS = 8000;

export interface IngestableEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
  relayUrl?: string;
  relayUrls?: string[];
}

interface UseNostrEventRouterParams {
  isConnected: boolean;
  subscribedKinds: number[];
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
  onEvent: (event: IngestableEvent) => void;
}

interface UseNostrEventRouterResult {
  hasLiveHydratedScope: boolean;
  /** True while the initial subscription backfill is in progress (pre-EOSE). */
  isHydrating: boolean;
}

type RelayLike = Pick<NDKRelay, "url"> | null | undefined;

type EventLike = Pick<NDKEvent, "id" | "pubkey" | "created_at" | "kind" | "tags" | "content" | "sig"> & {
  relay?: RelayLike;
  onRelays?: RelayLike[];
};

function getRelayUrlsFromEvent(event: EventLike, relayOverride?: RelayLike): string[] {
  return normalizeRelayUrlScope(
    [
      relayOverride?.url,
      event.relay?.url,
      ...(event.onRelays || []).map((relay) => relay?.url),
    ].filter((url): url is string => Boolean(url))
  );
}

function toIngestable(event: EventLike, relayOverride?: RelayLike): IngestableEvent | null {
  if (!event.id) return null;
  const relayUrls = getRelayUrlsFromEvent(event, relayOverride);
  return {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at || Math.floor(Date.now() / 1000),
    kind: event.kind,
    tags: event.tags,
    content: event.content || "",
    sig: event.sig || undefined,
    relayUrl: relayUrls[0],
    relayUrls: relayUrls.length > 0 ? relayUrls : undefined,
  };
}

export function useNostrEventRouter({
  isConnected,
  subscribedKinds,
  subscribe,
  onEvent,
}: UseNostrEventRouterParams): UseNostrEventRouterResult {
  const [hasLiveHydratedScope, setHasLiveHydratedScope] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);

  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const pushEvent = useCallback((event: EventLike, relayOverride?: RelayLike) => {
    const ingestable = toIngestable(event, relayOverride);
    if (!ingestable) return;
    onEventRef.current(ingestable);
    if (!hasLiveHydratedScope) setHasLiveHydratedScope(true);
  }, [hasLiveHydratedScope]);

  const finalizeBootstrapScope = useCallback(() => {
    setIsHydrating(false);
    setHasLiveHydratedScope(true);
  }, []);

  const pushEventRef = useRef(pushEvent);
  const finalizeBootstrapScopeRef = useRef(finalizeBootstrapScope);
  const subscribeRef = useRef(subscribe);
  const subscribedKindsRef = useRef(subscribedKinds);
  useEffect(() => { pushEventRef.current = pushEvent; }, [pushEvent]);
  useEffect(() => { finalizeBootstrapScopeRef.current = finalizeBootstrapScope; }, [finalizeBootstrapScope]);
  useEffect(() => { subscribeRef.current = subscribe; }, [subscribe]);
  useEffect(() => { subscribedKindsRef.current = subscribedKinds; }, [subscribedKinds]);

  const subscriptionRef = useRef<NDKSubscription | null>(null);
  const bootstrapTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    if (subscriptionRef.current) return;
    setIsHydrating(true);
    bootstrapTimeoutRef.current = window.setTimeout(() => {
      finalizeBootstrapScopeRef.current();
    }, CACHE_BOOTSTRAP_MAX_AGE_MS);

    const subscription = subscribeRef.current(
      [{ kinds: subscribedKindsRef.current }],
      (event) => pushEventRef.current(event as EventLike),
      { closeOnEose: false }
    );
    subscriptionRef.current = subscription;
    subscription?.on("event:dup", (event, relay) => {
      pushEventRef.current(event as EventLike, relay);
    });
    subscription?.on("eose", () => finalizeBootstrapScopeRef.current());
    subscription?.on("close", () => finalizeBootstrapScopeRef.current());
  }, [isConnected]);

  useEffect(() => {
    return () => {
      if (bootstrapTimeoutRef.current !== null) {
        window.clearTimeout(bootstrapTimeoutRef.current);
        bootstrapTimeoutRef.current = null;
      }
      setIsHydrating(false);
      subscriptionRef.current?.stop();
      subscriptionRef.current = null;
    };
  }, []);

  return {
    hasLiveHydratedScope,
    isHydrating,
  };
}
