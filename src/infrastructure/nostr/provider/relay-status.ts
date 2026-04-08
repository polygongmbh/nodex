import { NDKRelayStatus as NativeNDKRelayStatus } from "@nostr-dev-kit/ndk";
import type { NDKRelayStatus } from "./contracts";

export const MAX_INITIAL_CONNECT_FAILURES = 5;
export const RELAY_CONNECTING_GRACE_MS = 1000;

interface ResolveRelayLifecycleStatusOptions {
  mappedStatus: NDKRelayStatus["status"];
  previousStatus?: NDKRelayStatus["status"];
  hasConnectedOnce: boolean;
  isAutoPaused: boolean;
  attemptStartedAt?: number;
  now: number;
}

export function mapNativeRelayStatus(status: NativeNDKRelayStatus): NDKRelayStatus["status"] {
  switch (status) {
    case NativeNDKRelayStatus.CONNECTED:
    case NativeNDKRelayStatus.AUTHENTICATED:
    case NativeNDKRelayStatus.AUTH_REQUESTED:
    case NativeNDKRelayStatus.AUTHENTICATING:
      return "connected";
    case NativeNDKRelayStatus.CONNECTING:
    case NativeNDKRelayStatus.RECONNECTING:
    case NativeNDKRelayStatus.FLAPPING:
      return "connecting";
    case NativeNDKRelayStatus.DISCONNECTING:
    case NativeNDKRelayStatus.DISCONNECTED:
    default:
      return "disconnected";
  }
}

export function resolveRelayLifecycleStatus({
  mappedStatus,
  previousStatus,
  hasConnectedOnce,
  isAutoPaused,
  attemptStartedAt,
  now,
}: ResolveRelayLifecycleStatusOptions): NDKRelayStatus["status"] {
  if (isAutoPaused) return "connection-error";
  if (mappedStatus !== "disconnected") return mappedStatus;
  if (hasConnectedOnce) return "disconnected";
  if (previousStatus === "connection-error" || previousStatus === "verification-failed") {
    return previousStatus;
  }
  if (typeof attemptStartedAt === "number" && now - attemptStartedAt < RELAY_CONNECTING_GRACE_MS) {
    return "connecting";
  }
  return "disconnected";
}

export function resolveRelayStatus(params: ResolveRelayLifecycleStatusOptions & {
  readRejected: boolean;
  writeRejected: boolean;
}): NDKRelayStatus["status"] {
  const lifecycleStatus = resolveRelayLifecycleStatus(params);
  if (lifecycleStatus !== "connected") return lifecycleStatus;
  if (params.readRejected) return "verification-failed";
  if (params.writeRejected) return "read-only";
  return "connected";
}

export function inferMappedStatusFromUiStatus(
  status: NDKRelayStatus["status"] | undefined
): NDKRelayStatus["status"] {
  switch (status) {
    case "connected":
    case "read-only":
    case "verification-failed":
      return "connected";
    case "connecting":
      return "connecting";
    case "disconnected":
    case "connection-error":
    default:
      return "disconnected";
  }
}

function areRelayNip11SummariesEqual(
  left: NDKRelayStatus["nip11"],
  right: NDKRelayStatus["nip11"]
): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;
  return left.authRequired === right.authRequired
    && left.supportsNip42 === right.supportsNip42
    && left.checkedAt === right.checkedAt;
}

export function areRelayStatusesEqual(left: NDKRelayStatus, right: NDKRelayStatus): boolean {
  return left.url === right.url
    && left.status === right.status
    && left.latency === right.latency
    && areRelayNip11SummariesEqual(left.nip11, right.nip11);
}

export function mergeRelayStatusUpdates(
  previous: NDKRelayStatus[],
  updates: NDKRelayStatus[]
): NDKRelayStatus[] {
  if (updates.length === 0) return previous;

  const next = [...previous];
  const indexByUrl = new Map(previous.map((relay, index) => [relay.url, index] as const));
  let changed = false;

  updates.forEach((update) => {
    const existingIndex = indexByUrl.get(update.url);
    if (existingIndex === undefined) {
      next.push(update);
      indexByUrl.set(update.url, next.length - 1);
      changed = true;
      return;
    }

    const existing = next[existingIndex];
    if (areRelayStatusesEqual(existing, update)) {
      return;
    }

    next[existingIndex] = update;
    changed = true;
  });

  return changed ? next : previous;
}
