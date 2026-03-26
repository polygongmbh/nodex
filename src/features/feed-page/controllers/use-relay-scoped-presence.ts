import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS,
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildActivePresenceContent,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import type { Relay, Task } from "@/types";

const DEMO_RELAY_ID = "demo";
const OFFLINE_PRESENCE_FINGERPRINT = "offline";
const DEFAULT_RELAY_SWITCH_DEBOUNCE_MS = 750;
const DEFAULT_UNCHANGED_REFRESH_MS = Math.floor(
  (NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS * 1000) / 2
);

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
}

function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function dedupeRelayUrls(relayUrls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  relayUrls.forEach((relayUrl) => {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function buildActivePresenceFingerprint(currentView: string, taskId: string | null): string {
  return `active:${currentView}:${taskId ?? ""}`;
}

function buildTargetGroup(
  relayUrls: string[],
  currentView: string,
  taskId: string | null
): PresencePublishTarget | null {
  const normalizedRelayUrls = dedupeRelayUrls(relayUrls);
  if (normalizedRelayUrls.length === 0) return null;

  return {
    relayUrls: normalizedRelayUrls,
    content: buildActivePresenceContent(currentView, taskId),
    fingerprint: buildActivePresenceFingerprint(currentView, taskId),
    taskId,
  };
}

function buildOfflinePresenceTarget(relayUrls: string[]): PresencePublishTarget[] {
  const normalizedRelayUrls = dedupeRelayUrls(relayUrls);
  if (normalizedRelayUrls.length === 0) return [];

  return [
    {
      relayUrls: normalizedRelayUrls,
      content: buildOfflinePresenceContent(),
      fingerprint: OFFLINE_PRESENCE_FINGERPRINT,
      taskId: null,
    },
  ];
}

export function buildRelayScopedPresenceTargets({
  currentView,
  focusedTask,
  relayScopeIds,
  relays,
}: BuildRelayScopedPresenceTargetsOptions): PresencePublishTarget[] {
  const relayTargets = relays.filter(
    (relay) => relay.id !== DEMO_RELAY_ID && Boolean(relay.url) && relayScopeIds.has(relay.id)
  );

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
  lastFingerprintByRelayUrl: Map<string, string>,
  lastPublishedAtByRelayUrl: Map<string, number>,
  unchangedRefreshMs: number
): PresencePublishTarget[] {
  return targets
    .map((target) => ({
      ...target,
      relayUrls: target.relayUrls.filter((relayUrl) => {
        const previousFingerprint = lastFingerprintByRelayUrl.get(relayUrl);
        if (previousFingerprint !== target.fingerprint) {
          return true;
        }

        const previousPublishedAt = lastPublishedAtByRelayUrl.get(relayUrl);
        if (previousPublishedAt === undefined) {
          return true;
        }

        return now - previousPublishedAt >= unchangedRefreshMs;
      }),
    }))
    .filter((target) => target.relayUrls.length > 0);
}

function getCleanupRelayUrls(
  selectedRelayUrls: string[],
  lastFingerprintByRelayUrl: Map<string, string>
): string[] {
  return dedupeRelayUrls([
    ...selectedRelayUrls,
    ...Array.from(lastFingerprintByRelayUrl.entries())
      .filter(([, fingerprint]) => fingerprint !== OFFLINE_PRESENCE_FINGERPRINT)
      .map(([relayUrl]) => relayUrl),
  ]);
}

function computeNextRefreshDelay(
  selectedRelayUrls: string[],
  lastPublishedAtByRelayUrl: Map<string, number>,
  unchangedRefreshMs: number,
  now: number
): number | null {
  if (selectedRelayUrls.length === 0) return null;

  const refreshAt = selectedRelayUrls.reduce<number | null>((earliest, relayUrl) => {
    const publishedAt = lastPublishedAtByRelayUrl.get(relayUrl);
    if (publishedAt === undefined) {
      return 0;
    }

    const dueAt = publishedAt + unchangedRefreshMs;
    if (earliest === null || dueAt < earliest) {
      return dueAt;
    }
    return earliest;
  }, null);

  if (refreshAt === null) return null;
  return Math.max(0, refreshAt - now);
}

async function publishPresenceTargets(
  targets: PresencePublishTarget[],
  publishEvent: UseRelayScopedPresenceOptions["publishEvent"],
  lastFingerprintByRelayUrl: Map<string, string>,
  lastPublishedAtByRelayUrl: Map<string, number>,
  expirySeconds: number
): Promise<void> {
  for (const target of targets) {
    const expirationUnix = Math.floor(Date.now() / 1000) + expirySeconds;
    nostrDevLog("presence", "Publishing relay-scoped presence", {
      relayUrls: target.relayUrls,
      fingerprint: target.fingerprint,
      taskId: target.taskId,
    });

    const result = await publishEvent(
      NostrEventKind.UserStatus,
      target.content,
      buildPresenceTags(expirationUnix),
      undefined,
      target.relayUrls
    );

    if (!result.success) continue;

    const publishedRelayUrls = dedupeRelayUrls(
      result.publishedRelayUrls && result.publishedRelayUrls.length > 0
        ? result.publishedRelayUrls
        : target.relayUrls
    );
    const publishedAt = Date.now();
    publishedRelayUrls.forEach((relayUrl) => {
      lastFingerprintByRelayUrl.set(relayUrl, target.fingerprint);
      lastPublishedAtByRelayUrl.set(relayUrl, publishedAt);
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
}: UseRelayScopedPresenceOptions) {
  const [syncVersion, setSyncVersion] = useState(0);
  const activeTargets = useMemo(
    () => buildRelayScopedPresenceTargets({ currentView, focusedTask, relayScopeIds, relays }),
    [currentView, focusedTask, relayScopeIds, relays]
  );
  const selectedRelayUrls = useMemo(
    () => dedupeRelayUrls(activeTargets.flatMap((target) => target.relayUrls)),
    [activeTargets]
  );
  const scopeKey = useMemo(() => selectedRelayUrls.join("|"), [selectedRelayUrls]);
  const lastPublishedFingerprintByRelayUrlRef = useRef<Map<string, string>>(new Map());
  const lastPublishedAtByRelayUrlRef = useRef<Map<string, number>>(new Map());
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
        lastPublishedFingerprintByRelayUrlRef.current
      )
    );
  }, [presenceEnabled, selectedRelayUrls, setPresenceRelayUrls, userPubkey]);

  const publishOfflinePresenceNow = useCallback(async () => {
    if (!presenceEnabled || !userPubkey) return;

    const cleanupRelayUrls = getCleanupRelayUrls(
      selectedRelayUrls,
      lastPublishedFingerprintByRelayUrlRef.current
    );
    const offlineTargets = buildOfflinePresenceTarget(cleanupRelayUrls);
    if (offlineTargets.length === 0) return;

    await publishPresenceTargets(
      offlineTargets,
      publishEvent,
      lastPublishedFingerprintByRelayUrlRef.current,
      lastPublishedAtByRelayUrlRef.current,
      NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS
    );

    if (mountedRef.current) {
      setSyncVersion((version) => version + 1);
    }
  }, [presenceEnabled, publishEvent, selectedRelayUrls, userPubkey]);

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
      lastPublishedFingerprintByRelayUrlRef.current.clear();
      lastPublishedAtByRelayUrlRef.current.clear();
      refreshRegisteredRelayUrls();
      return;
    }

    if (previousUserPubkeyRef.current !== userPubkey) {
      previousUserPubkeyRef.current = userPubkey;
      previousScopeKeyRef.current = null;
      lastPublishedFingerprintByRelayUrlRef.current.clear();
      lastPublishedAtByRelayUrlRef.current.clear();
    }

    const now = Date.now();
    const staleActiveRelayUrls = Array.from(
      lastPublishedFingerprintByRelayUrlRef.current.entries()
    )
      .filter(
        ([relayUrl, fingerprint]) =>
          fingerprint !== OFFLINE_PRESENCE_FINGERPRINT &&
          !selectedRelayUrls.includes(relayUrl)
      )
      .map(([relayUrl]) => relayUrl);
    const activeTargetsToPublish = filterTargetsNeedingPublish(
      activeTargets,
      now,
      lastPublishedFingerprintByRelayUrlRef.current,
      lastPublishedAtByRelayUrlRef.current,
      unchangedRefreshMs
    );
    const scopeChanged =
      previousScopeKeyRef.current !== null && previousScopeKeyRef.current !== scopeKey;
    previousScopeKeyRef.current = scopeKey;

    if (staleActiveRelayUrls.length > 0 || activeTargetsToPublish.length > 0) {
      const delayMs = scopeChanged ? relaySwitchDebounceMs : 0;
      timerRef.current = setTimeout(() => {
        void (async () => {
          if (staleActiveRelayUrls.length > 0) {
            await publishPresenceTargets(
              buildOfflinePresenceTarget(staleActiveRelayUrls),
              publishEvent,
              lastPublishedFingerprintByRelayUrlRef.current,
              lastPublishedAtByRelayUrlRef.current,
              NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS
            );
          }

          if (activeTargetsToPublish.length > 0) {
            await publishPresenceTargets(
              activeTargetsToPublish,
              publishEvent,
              lastPublishedFingerprintByRelayUrlRef.current,
              lastPublishedAtByRelayUrlRef.current,
              NIP38_PRESENCE_ACTIVE_EXPIRY_SECONDS
            );
          }

          if (mountedRef.current) {
            setSyncVersion((version) => version + 1);
          }
        })();
      }, delayMs);
      return clearTimer;
    }

    const nextRefreshDelay = computeNextRefreshDelay(
      selectedRelayUrls,
      lastPublishedAtByRelayUrlRef.current,
      unchangedRefreshMs,
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
