import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  dedupeNormalizedRelayUrls,
  filterRelayUrlsToWritableSet,
  normalizeRelayUrl,
  resolveWritableAppRelayUrls,
} from "@/lib/nostr/relay-write-targets";
import {
  NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS,
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildActivePresenceContent,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import type { Relay, Task } from "@/types";

const OFFLINE_PRESENCE_FINGERPRINT = "offline";
const DEFAULT_RELAY_SWITCH_DEBOUNCE_MS = 3000;
const DEFAULT_UNCHANGED_REFRESH_MS = Math.floor(
  (NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS * 1000) / 2
);
const DEFAULT_FAILED_RETRY_MS = 15000;

interface PublishResult {
  success: boolean;
  publishedRelayUrls?: string[];
}

interface PresencePublishTarget {
  relayUrls: string[];
  content: string;
  fingerprint: string;
  taskId: string | null;
}

interface RelayPresenceState {
  fingerprint: string;
  lastAttemptedAt: number;
  lastPublishedAt?: number;
}

interface BuildRelayScopedPresenceTargetsOptions {
  currentView: string;
  focusedTask: Task | null;
  relayScopeIds: Set<string>;
  relays: Relay[];
}

interface UseRelayScopedPresenceOptions extends BuildRelayScopedPresenceTargetsOptions {
  userPubkey: string | null | undefined;
  presenceEnabled: boolean;
  publishEvent: (
    kind: NostrEventKind,
    content: string,
    tags?: string[][],
    parentId?: string,
    relayUrls?: string[]
  ) => Promise<PublishResult>;
  setPresenceRelayUrls?: (relayUrls: string[]) => void;
  relaySwitchDebounceMs?: number;
  unchangedRefreshMs?: number;
  failedRetryMs?: number;
}

function buildActivePresenceFingerprint(currentView: string, taskId: string | null): string {
  return `active:${currentView}:${taskId ?? ""}`;
}

function buildTargetGroup(
  relayUrls: string[],
  currentView: string,
  taskId: string | null
): PresencePublishTarget | null {
  const normalizedRelayUrls = dedupeNormalizedRelayUrls(relayUrls);
  if (normalizedRelayUrls.length === 0) return null;

  return {
    relayUrls: normalizedRelayUrls,
    content: buildActivePresenceContent(currentView, taskId),
    fingerprint: buildActivePresenceFingerprint(currentView, taskId),
    taskId,
  };
}

function buildOfflinePresenceTarget(relayUrls: string[]): PresencePublishTarget[] {
  const normalizedRelayUrls = dedupeNormalizedRelayUrls(relayUrls);
  if (normalizedRelayUrls.length === 0) return [];

  return [{
    relayUrls: normalizedRelayUrls,
    content: buildOfflinePresenceContent(),
    fingerprint: OFFLINE_PRESENCE_FINGERPRINT,
    taskId: null,
  }];
}

function resolveWritableRelayUrlSet(relays: Relay[]): Set<string> {
  return new Set(resolveWritableAppRelayUrls(relays));
}

export function buildRelayScopedPresenceTargets({
  currentView,
  focusedTask,
  relayScopeIds,
  relays,
}: BuildRelayScopedPresenceTargetsOptions): PresencePublishTarget[] {
  const writableRelayUrls = resolveWritableRelayUrlSet(relays);
  const relayTargets = relays.filter((relay) => {
    if (!relay.url || !relayScopeIds.has(relay.id)) return false;
    return writableRelayUrls.has(normalizeRelayUrl(relay.url));
  });

  if (relayTargets.length === 0) {
    return [];
  }

  const taskId =
    focusedTask && isNostrEventId(focusedTask.id) && focusedTask.relays.length > 0
      ? focusedTask.id
      : null;
  const visibleRelayIds = taskId ? new Set(focusedTask?.relays ?? []) : null;
  const withTaskIdRelayUrls: string[] = [];
  const withoutTaskIdRelayUrls: string[] = [];

  relayTargets.forEach((relay) => {
    const relayUrl = relay.url ? normalizeRelayUrl(relay.url) : "";
    if (!relayUrl) return;

    if (taskId && visibleRelayIds?.has(relay.id)) {
      withTaskIdRelayUrls.push(relayUrl);
      return;
    }

    withoutTaskIdRelayUrls.push(relayUrl);
  });

  return [
    buildTargetGroup(withTaskIdRelayUrls, currentView, taskId),
    buildTargetGroup(withoutTaskIdRelayUrls, currentView, null),
  ].filter((target): target is PresencePublishTarget => Boolean(target));
}

function filterTargetsNeedingPublish(
  targets: PresencePublishTarget[],
  now: number,
  relayStateByRelayUrl: Map<string, RelayPresenceState>,
  unchangedRefreshMs: number,
  failedRetryMs: number
): PresencePublishTarget[] {
  return targets
    .map((target) => ({
      ...target,
      relayUrls: target.relayUrls.filter((relayUrl) => {
        const previous = relayStateByRelayUrl.get(relayUrl);
        if (!previous || previous.fingerprint !== target.fingerprint) {
          return true;
        }

        if (typeof previous.lastPublishedAt === "number") {
          return now - previous.lastPublishedAt >= unchangedRefreshMs;
        }

        return now - previous.lastAttemptedAt >= failedRetryMs;
      }),
    }))
    .filter((target) => target.relayUrls.length > 0);
}

function getCleanupRelayUrls(
  selectedRelayUrls: string[],
  relayStateByRelayUrl: Map<string, RelayPresenceState>,
  writableRelayUrls: Set<string>
): string[] {
  return filterRelayUrlsToWritableSet([
    ...selectedRelayUrls,
    ...Array.from(relayStateByRelayUrl.entries())
      .filter(([, state]) => state.fingerprint !== OFFLINE_PRESENCE_FINGERPRINT)
      .map(([relayUrl]) => relayUrl),
  ], writableRelayUrls);
}

function computeNextRefreshDelay(
  selectedRelayUrls: string[],
  relayStateByRelayUrl: Map<string, RelayPresenceState>,
  unchangedRefreshMs: number,
  failedRetryMs: number,
  now: number
): number | null {
  if (selectedRelayUrls.length === 0) return null;

  const refreshAt = selectedRelayUrls.reduce<number | null>((earliest, relayUrl) => {
    const previous = relayStateByRelayUrl.get(relayUrl);
    if (!previous) {
      return 0;
    }

    const nextDueAt = typeof previous.lastPublishedAt === "number"
      ? previous.lastPublishedAt + unchangedRefreshMs
      : previous.lastAttemptedAt + failedRetryMs;

    if (earliest === null || nextDueAt < earliest) {
      return nextDueAt;
    }
    return earliest;
  }, null);

  if (refreshAt === null) return null;
  return Math.max(0, refreshAt - now);
}

async function publishPresenceTargets(
  targets: PresencePublishTarget[],
  publishEvent: UseRelayScopedPresenceOptions["publishEvent"],
  relayStateByRelayUrl: Map<string, RelayPresenceState>
): Promise<void> {
  for (const target of targets) {
    const attemptedRelayUrls = dedupeNormalizedRelayUrls(target.relayUrls);
    if (attemptedRelayUrls.length === 0) continue;

    const attemptedAt = Date.now();
    attemptedRelayUrls.forEach((relayUrl) => {
      relayStateByRelayUrl.set(relayUrl, {
        fingerprint: target.fingerprint,
        lastAttemptedAt: attemptedAt,
      });
    });

    const expirationUnix = Math.floor(attemptedAt / 1000) + (
      target.fingerprint === OFFLINE_PRESENCE_FINGERPRINT
        ? NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS
        : NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS
    );
    nostrDevLog("presence", "Publishing relay-scoped presence", {
      relayUrls: attemptedRelayUrls,
      fingerprint: target.fingerprint,
      taskId: target.taskId,
    });

    const result = await publishEvent(
      NostrEventKind.UserStatus,
      target.content,
      buildPresenceTags(expirationUnix),
      undefined,
      attemptedRelayUrls
    );

    const publishedRelayUrls = dedupeNormalizedRelayUrls(
      result.success
        ? ((result.publishedRelayUrls && result.publishedRelayUrls.length > 0)
            ? result.publishedRelayUrls
            : attemptedRelayUrls)
        : []
    );

    publishedRelayUrls.forEach((relayUrl) => {
      relayStateByRelayUrl.set(relayUrl, {
        fingerprint: target.fingerprint,
        lastAttemptedAt: attemptedAt,
        lastPublishedAt: Date.now(),
      });
    });
  }
}

export function useRelayScopedPresence({
  userPubkey,
  presenceEnabled,
  currentView,
  focusedTask,
  relayScopeIds,
  relays,
  publishEvent,
  setPresenceRelayUrls,
  relaySwitchDebounceMs = DEFAULT_RELAY_SWITCH_DEBOUNCE_MS,
  unchangedRefreshMs = DEFAULT_UNCHANGED_REFRESH_MS,
  failedRetryMs = DEFAULT_FAILED_RETRY_MS,
}: UseRelayScopedPresenceOptions) {
  const [syncVersion, setSyncVersion] = useState(0);
  const activeTargets = useMemo(
    () => buildRelayScopedPresenceTargets({ currentView, focusedTask, relayScopeIds, relays }),
    [currentView, focusedTask, relayScopeIds, relays]
  );
  const selectedRelayUrls = useMemo(
    () => dedupeNormalizedRelayUrls(activeTargets.flatMap((target) => target.relayUrls)),
    [activeTargets]
  );
  const writableRelayUrlSet = useMemo(() => resolveWritableRelayUrlSet(relays), [relays]);
  const scopeKey = useMemo(() => selectedRelayUrls.join("|"), [selectedRelayUrls]);
  const relayStateByRelayUrlRef = useRef<Map<string, RelayPresenceState>>(new Map());
  const previousScopeKeyRef = useRef<string | null>(null);
  const previousUserPubkeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const refreshRegisteredRelayUrls = useCallback(() => {
    if (!setPresenceRelayUrls) return;

    if (!presenceEnabled || !userPubkey) {
      setPresenceRelayUrls([]);
      return;
    }

    setPresenceRelayUrls(
      getCleanupRelayUrls(
        selectedRelayUrls,
        relayStateByRelayUrlRef.current,
        writableRelayUrlSet
      )
    );
  }, [presenceEnabled, selectedRelayUrls, setPresenceRelayUrls, userPubkey, writableRelayUrlSet]);

  const publishOfflinePresenceNow = useCallback(async () => {
    if (!presenceEnabled || !userPubkey) return;

    const cleanupRelayUrls = getCleanupRelayUrls(
      selectedRelayUrls,
      relayStateByRelayUrlRef.current,
      writableRelayUrlSet
    );
    const offlineTargets = buildOfflinePresenceTarget(cleanupRelayUrls);
    if (offlineTargets.length === 0) return;

    await publishPresenceTargets(
      offlineTargets,
      publishEvent,
      relayStateByRelayUrlRef.current
    );

    if (mountedRef.current) {
      setSyncVersion((version) => version + 1);
    }
  }, [presenceEnabled, publishEvent, selectedRelayUrls, userPubkey, writableRelayUrlSet]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    refreshRegisteredRelayUrls();
  }, [refreshRegisteredRelayUrls, syncVersion]);

  useEffect(() => {
    clearTimer();

    if (!presenceEnabled || !userPubkey) {
      previousScopeKeyRef.current = null;
      previousUserPubkeyRef.current = userPubkey ?? null;
      relayStateByRelayUrlRef.current.clear();
      refreshRegisteredRelayUrls();
      return;
    }

    if (previousUserPubkeyRef.current !== userPubkey) {
      previousUserPubkeyRef.current = userPubkey;
      previousScopeKeyRef.current = null;
      relayStateByRelayUrlRef.current.clear();
    }

    const now = Date.now();
    const activeTargetsToPublish = filterTargetsNeedingPublish(
      activeTargets,
      now,
      relayStateByRelayUrlRef.current,
      unchangedRefreshMs,
      failedRetryMs
    );
    const scopeChanged =
      previousScopeKeyRef.current !== null && previousScopeKeyRef.current !== scopeKey;
    previousScopeKeyRef.current = scopeKey;

    if (activeTargetsToPublish.length > 0) {
      const delayMs = scopeChanged ? relaySwitchDebounceMs : 0;
      timerRef.current = setTimeout(() => {
        void (async () => {
          await publishPresenceTargets(
            activeTargetsToPublish,
            publishEvent,
            relayStateByRelayUrlRef.current
          );

          if (mountedRef.current) {
            setSyncVersion((version) => version + 1);
          }
        })();
      }, delayMs);
      return clearTimer;
    }

    const nextRefreshDelay = computeNextRefreshDelay(
      selectedRelayUrls,
      relayStateByRelayUrlRef.current,
      unchangedRefreshMs,
      failedRetryMs,
      now
    );
    if (nextRefreshDelay === null) {
      return;
    }

    timerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setSyncVersion((version) => version + 1);
    }, nextRefreshDelay);
    return clearTimer;
  }, [
    activeTargets,
    clearTimer,
    failedRetryMs,
    presenceEnabled,
    publishEvent,
    refreshRegisteredRelayUrls,
    relaySwitchDebounceMs,
    scopeKey,
    selectedRelayUrls,
    syncVersion,
    unchangedRefreshMs,
    userPubkey,
  ]);

  return {
    publishOfflinePresenceNow,
  };
}
