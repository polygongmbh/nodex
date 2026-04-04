import { useCallback, useEffect, useRef } from "react";
import type { Relay } from "@/types";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";

const FAILED_STATUSES = new Set<NonNullable<Relay["connectionStatus"]>>([
  "connection-error",
  "verification-failed",
  "disconnected",
]);
const HEALTHY_OR_RECOVERING_STATUSES = new Set<NonNullable<Relay["connectionStatus"]>>([
  "connected",
  "read-only",
  "connecting",
]);

const DEFAULT_RETRY_BASE_MS = 7_000;
const DEFAULT_RETRY_MULTIPLIER = 2;
const DEFAULT_RETRY_MAX_MS = 60_000;
const DEFAULT_RETRY_TICK_MS = 7_000;
const DEFAULT_FOCUS_RESET_DEBOUNCE_MS = 500;

interface UseRelayAutoReconnectOptions {
  relays: Relay[];
  activeRelayIds: Set<string>;
  reconnectRelay: (url: string, options?: { forceNewSocket?: boolean }) => void;
  retryBaseMs?: number;
  retryMultiplier?: number;
  retryMaxMs?: number;
  retryTickMs?: number;
  focusResetDebounceMs?: number;
}

function resolveRelayConnectionStatus(relay: Relay): NonNullable<Relay["connectionStatus"]> {
  if (!relay.connectionStatus) return "connected";
  return relay.connectionStatus;
}

function isEligibleRelay(relay: Relay): relay is Relay & { url: string } {
  if (relay.id === "demo") return false;
  if (typeof relay.url !== "string") return false;
  return normalizeRelayUrl(relay.url).length > 0;
}

function isFailedRelay(relay: Relay): relay is Relay & { url: string } {
  if (!isEligibleRelay(relay)) return false;
  return FAILED_STATUSES.has(resolveRelayConnectionStatus(relay));
}

export function useRelayAutoReconnect({
  relays,
  activeRelayIds,
  reconnectRelay,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMultiplier = DEFAULT_RETRY_MULTIPLIER,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
  retryTickMs = DEFAULT_RETRY_TICK_MS,
  focusResetDebounceMs = DEFAULT_FOCUS_RESET_DEBOUNCE_MS,
}: UseRelayAutoReconnectOptions): void {
  const attemptCountByRelayRef = useRef<Map<string, number>>(new Map());
  const nextEligibleAtByRelayRef = useRef<Map<string, number>>(new Map());
  const lastFocusResetAtRef = useRef(0);

  const pruneBackoffForHealthyRelays = useCallback(() => {
    const failedRelayUrls = new Set(
      relays.filter(isFailedRelay).map((relay) => normalizeRelayUrl(relay.url))
    );

    attemptCountByRelayRef.current.forEach((_, relayUrl) => {
      if (!failedRelayUrls.has(relayUrl)) {
        attemptCountByRelayRef.current.delete(relayUrl);
      }
    });
    nextEligibleAtByRelayRef.current.forEach((_, relayUrl) => {
      if (!failedRelayUrls.has(relayUrl)) {
        nextEligibleAtByRelayRef.current.delete(relayUrl);
      }
    });
  }, [relays]);

  const runReconnectPass = useCallback((options?: { force?: boolean }) => {
    const eligibleRelays = relays.filter(isEligibleRelay);
    if (eligibleRelays.length === 0) return;

    eligibleRelays.forEach((relay) => {
      const normalizedRelayUrl = normalizeRelayUrl(relay.url);
      const status = resolveRelayConnectionStatus(relay);
      if (!HEALTHY_OR_RECOVERING_STATUSES.has(status)) return;
      attemptCountByRelayRef.current.delete(normalizedRelayUrl);
      nextEligibleAtByRelayRef.current.delete(normalizedRelayUrl);
    });

    const failedRelays = eligibleRelays.filter((relay) =>
      FAILED_STATUSES.has(resolveRelayConnectionStatus(relay))
    );
    if (failedRelays.length === 0) return;

    const allEligibleRelaysFailed = failedRelays.length === eligibleRelays.length;
    const failedSelectedRelays = activeRelayIds.size > 0
      ? failedRelays.filter((relay) => activeRelayIds.has(relay.id))
      : [];

    const targets = allEligibleRelaysFailed
      ? failedRelays
      : failedSelectedRelays;
    if (targets.length === 0) return;

    const now = Date.now();
    targets.forEach((relay) => {
      const relayUrl = normalizeRelayUrl(relay.url);
      const nextEligibleAt = nextEligibleAtByRelayRef.current.get(relayUrl) ?? 0;
      if (!options?.force && now < nextEligibleAt) return;

      reconnectRelay(relayUrl, { forceNewSocket: false });

      const nextAttemptCount = (attemptCountByRelayRef.current.get(relayUrl) ?? 0) + 1;
      attemptCountByRelayRef.current.set(relayUrl, nextAttemptCount);
      const cooldown = Math.min(
        retryBaseMs * retryMultiplier ** Math.max(nextAttemptCount - 1, 0),
        retryMaxMs
      );
      nextEligibleAtByRelayRef.current.set(relayUrl, now + cooldown);
    });
  }, [activeRelayIds, reconnectRelay, relays, retryBaseMs, retryMaxMs, retryMultiplier]);

  const resetCooldownAndRetry = useCallback(() => {
    const now = Date.now();
    if (now - lastFocusResetAtRef.current < focusResetDebounceMs) return;
    lastFocusResetAtRef.current = now;

    attemptCountByRelayRef.current.clear();
    nextEligibleAtByRelayRef.current.clear();
    runReconnectPass({ force: true });
  }, [focusResetDebounceMs, runReconnectPass]);

  useEffect(() => {
    pruneBackoffForHealthyRelays();
  }, [pruneBackoffForHealthyRelays]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      runReconnectPass();
    }, retryTickMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [retryTickMs, runReconnectPass]);

  useEffect(() => {
    const handleFocus = () => {
      resetCooldownAndRetry();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      resetCooldownAndRetry();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resetCooldownAndRetry]);
}
