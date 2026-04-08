import { useCallback, useEffect, useMemo, useRef } from "react";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { NostrEventKind } from "@/lib/nostr/types";
import { dedupeNormalizedRelayUrls, normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import {
  filterRelayUrlsToWritableSet,
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

// Only fingerprint matters — no time-based retry or refresh tracking.
interface RelayPresenceState {
  fingerprint: string;
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

// Returns targets (and relay subsets within them) that haven't been published
// with the current fingerprint yet. No time-based refresh — presence expires
// naturally via the NIP-38 expiration tag.
function filterTargetsNeedingPublish(
  targets: PresencePublishTarget[],
  relayStateByRelayUrl: Map<string, RelayPresenceState>
): PresencePublishTarget[] {
  return targets
    .map((target) => ({
      ...target,
      relayUrls: target.relayUrls.filter((relayUrl) => {
        const previous = relayStateByRelayUrl.get(relayUrl);
        return !previous || previous.fingerprint !== target.fingerprint;
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

async function publishPresenceTargets(
  targets: PresencePublishTarget[],
  publishEvent: UseRelayScopedPresenceOptions["publishEvent"],
  relayStateByRelayUrl: Map<string, RelayPresenceState>
): Promise<void> {
  for (const target of targets) {
    const attemptedRelayUrls = dedupeNormalizedRelayUrls(target.relayUrls);
    if (attemptedRelayUrls.length === 0) continue;

    const attemptedAt = Date.now();
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
      relayStateByRelayUrl.set(relayUrl, { fingerprint: target.fingerprint });
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
}: UseRelayScopedPresenceOptions) {
  const activeTargets = useMemo(
    () => buildRelayScopedPresenceTargets({ currentView, focusedTask, relayScopeIds, relays }),
    [currentView, focusedTask, relayScopeIds, relays]
  );
  const selectedRelayUrls = useMemo(
    () => dedupeNormalizedRelayUrls(activeTargets.flatMap((target) => target.relayUrls)),
    [activeTargets]
  );
  const writableRelayUrlSet = useMemo(() => resolveWritableRelayUrlSet(relays), [relays]);
  const relayStateByRelayUrlRef = useRef<Map<string, RelayPresenceState>>(new Map());
  const previousUserPubkeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

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
      refreshRegisteredRelayUrls();
    }
  }, [presenceEnabled, publishEvent, refreshRegisteredRelayUrls, selectedRelayUrls, userPubkey, writableRelayUrlSet]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Keep registered relay URLs current whenever selection or writable set changes.
  useEffect(() => {
    refreshRegisteredRelayUrls();
  }, [refreshRegisteredRelayUrls]);

  // Publish when scope or fingerprint changes. No periodic refresh — presence
  // expires naturally via the NIP-38 expiration tag; re-navigation republishes.
  // Effect cleanup cancels in-flight publishes on re-render (rapid relay switching
  // naturally drops superseded publishes without an explicit debounce).
  useEffect(() => {
    let cancelled = false;

    if (!presenceEnabled || !userPubkey) {
      previousUserPubkeyRef.current = userPubkey ?? null;
      relayStateByRelayUrlRef.current.clear();
      refreshRegisteredRelayUrls();
      return;
    }

    if (previousUserPubkeyRef.current !== userPubkey) {
      previousUserPubkeyRef.current = userPubkey;
      relayStateByRelayUrlRef.current.clear();
    }

    const targetsToPublish = filterTargetsNeedingPublish(
      activeTargets,
      relayStateByRelayUrlRef.current
    );
    if (targetsToPublish.length === 0) return;

    void (async () => {
      await publishPresenceTargets(targetsToPublish, publishEvent, relayStateByRelayUrlRef.current);
      if (!cancelled && mountedRef.current) refreshRegisteredRelayUrls();
    })();

    return () => { cancelled = true; };
  }, [activeTargets, presenceEnabled, publishEvent, refreshRegisteredRelayUrls, userPubkey]);

  return {
    publishOfflinePresenceNow,
  };
}
