import { useCallback } from "react";
import type { MutableRefObject } from "react";
import NDK, { NDKEvent, NDKRelaySet, NDKFilter, NDKSubscription, NDKRelay } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "../types";
import { normalizeRelayUrl } from "./relay-list";
import { createNip98AuthHeader } from "../nip98-http-auth";
import {
  extractRelayRejectionReason,
} from "./relay-error";
import {
  isAuthRequiredCloseReason,
  shouldMarkRelayReadOnlyAfterPublishReject,
  shouldRetryAuthAfterReadRejection,
  shouldSetVerificationFailedStatus,
} from "./relay-verification";
import { applyPerformanceAwareSubscriptionLimits } from "./subscription-limits";
import { nostrDevLog } from "../dev-logs";
import type { NDKRelayStatus } from "./contracts";
import type { RelayVerificationCallbacks } from "./use-relay-verification";
import type { RelayTransportCallbacks } from "./use-relay-transport";

const RELAY_PUBLISH_TIMEOUT_MS = 3000;

export interface PublishCallbacks {
  publishEvent: (
    kind: NostrEventKind,
    content: string,
    tags?: string[][],
    parentId?: string,
    relayUrls?: string[]
  ) => Promise<{ success: boolean; eventId?: string; rejectionReason?: string; publishedRelayUrls?: string[] }>;
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
  createHttpAuthHeader: (
    url: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  ) => Promise<string | null>;
}

export function usePublish(
  ndkRef: MutableRefObject<NDK | null>,
  relays: NDKRelayStatus[],
  resolvedDefaultRelays: string[],
  verification: Pick<RelayVerificationCallbacks, "beginRelayOperation" | "endRelayOperation" | "markRelayVerificationFailure" | "markRelayWriteOutcome" | "markRelayReadOutcome">,
  transport: Pick<RelayTransportCallbacks, "connectRelay">,
  pendingRelayVerificationRef: MutableRefObject<Map<string, { operation: string; requestedAt: number }>>,
  relayAuthRetryHistoryRef: MutableRefObject<Map<string, number>>,
): PublishCallbacks {
  const { beginRelayOperation, endRelayOperation, markRelayVerificationFailure, markRelayWriteOutcome, markRelayReadOutcome } = verification;
  const { connectRelay } = transport;

  const publishEvent = useCallback(async (
    kind: NostrEventKind,
    content: string,
    tags: string[][] = [],
    parentId?: string,
    relayUrls?: string[]
  ): Promise<{ success: boolean; eventId?: string; rejectionReason?: string; publishedRelayUrls?: string[] }> => {
    const ndk = ndkRef.current;
    if (!ndk || !ndk.signer) {
      console.error("Not authenticated or NDK not ready");
      return { success: false };
    }

    let signedEventId: string | undefined;
    let targetRelayUrls: string[] = [];
    try {
      beginRelayOperation("write");
      const event = new NDKEvent(ndk);
      event.kind = kind;
      event.content = content;

      // Build tags
      const eventTags: string[][] = [...tags];

      // Add reply tag if this is a reply
      if (parentId) {
        eventTags.push(["e", parentId, "", "reply"]);
      }

      // Extract hashtags for text content kinds only.
      if (kind === NostrEventKind.TextNote || kind === NostrEventKind.Task) {
        const hashtagRegex = /#(\w+)/g;
        let match;
        while ((match = hashtagRegex.exec(content)) !== null) {
          eventTags.push(["t", match[1].toLowerCase()]);
        }
      }

      event.tags = eventTags;

      await event.sign();
      signedEventId = event.id;

      const urls = (relayUrls && relayUrls.length > 0)
        ? relayUrls
        : relays.map((r) => r.url);
      targetRelayUrls = Array.from(
        new Set((urls.length > 0 ? urls : resolvedDefaultRelays).map(normalizeRelayUrl).filter(Boolean))
      );
      nostrDevLog("publish", "Preparing publish relay set", {
        kind,
        eventTagCount: eventTags.length,
        parentId: parentId || null,
        reason: relayUrls && relayUrls.length > 0 ? "explicit relay override" : "active relays fallback",
        targetRelayUrls,
      });
      const publishedRelayUrlSet = new Set<string>();
      let rejectionReason: string | undefined;

      for (const relayUrl of targetRelayUrls) {
        try {
          const relaySet = NDKRelaySet.fromRelayUrls([relayUrl], ndk, true);
          const publishedTo = await event.publish(relaySet, RELAY_PUBLISH_TIMEOUT_MS, 1);
          Array.from(publishedTo)
            .map((relay) => normalizeRelayUrl(relay.url))
            .filter(Boolean)
            .forEach((url) => publishedRelayUrlSet.add(url));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error || "");
          const extractedReason = extractRelayRejectionReason(error);
          if (!rejectionReason && extractedReason) {
            rejectionReason = extractedReason;
          }
          if (shouldMarkRelayReadOnlyAfterPublishReject({ errorMessage, rejectionReason: extractedReason })) {
            markRelayVerificationFailure(relayUrl, "write", {
              setStatus: true,
              showToast: false,
            });
          }
          nostrDevLog("publish", "Relay publish attempt failed", {
            relayUrl,
            rejectionReason: extractedReason || null,
            error: errorMessage,
          });
        }
      }

      const publishedRelayUrls = Array.from(publishedRelayUrlSet);
      if (publishedRelayUrls.length === 0) {
        console.warn("Event publish completed but no relays confirmed receipt");
        return { success: false, eventId: event.id, rejectionReason };
      }

      publishedRelayUrls.forEach((relayUrl) => {
        markRelayWriteOutcome(relayUrl, true);
      });
      nostrDevLog("publish", "Event published", {
        eventId: event.id,
        kind,
        targetRelayUrls,
        publishedRelayUrls,
      });
      return { success: true, eventId: event.id, publishedRelayUrls };
    } catch (error) {
      console.error("Failed to publish event:", error);
      const errorMessage = error instanceof Error ? error.message : String(error || "");
      const rejectionReason = extractRelayRejectionReason(error);
      if (shouldMarkRelayReadOnlyAfterPublishReject({ errorMessage, rejectionReason })) {
        const failedRelayUrls = [...targetRelayUrls];
        if (failedRelayUrls.length === 0 && relayUrls && relayUrls.length === 1) {
          failedRelayUrls.push(relayUrls[0].replace(/\/+$/, ""));
        }
        failedRelayUrls.forEach((relayUrl) => {
          markRelayVerificationFailure(relayUrl, "write", {
            setStatus: true,
            showToast: false,
          });
        });
        nostrDevLog("relay", "Publish write-rejection failure scope", {
          targetRelayUrls,
          failedRelayUrls,
          rejectionReason,
        });
      }
      return { success: false, eventId: signedEventId, rejectionReason };
    } finally {
      endRelayOperation("write");
    }
  }, [
    ndkRef,
    relays,
    resolvedDefaultRelays,
    beginRelayOperation,
    endRelayOperation,
    markRelayVerificationFailure,
    markRelayWriteOutcome,
  ]);

  const subscribe = useCallback((
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ): NDKSubscription | null => {
    const ndk = ndkRef.current;
    if (!ndk) return null;
    const limitDecision = applyPerformanceAwareSubscriptionLimits(filters, typeof navigator === "undefined"
      ? undefined
      : {
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemory: "deviceMemory" in navigator ? navigator.deviceMemory : undefined,
      });

    nostrDevLog("subscribe", "Creating subscription", {
      filterCount: filters.length,
      filters: limitDecision.filters,
      performanceClass: limitDecision.performanceClass,
      subscriptionLimitCap: limitDecision.cap,
      appliedPerformanceCap: limitDecision.changed,
    });

    beginRelayOperation("read");
    const subscription = ndk.subscribe(limitDecision.filters, { closeOnEose: options?.closeOnEose ?? false });

    subscription.on("event", (event: NDKEvent) => {
      if (event.relay?.url) {
        markRelayReadOutcome(event.relay.url, true);
      }
      onEvent(event);
    });
    subscription.on("closed", (relay: NDKRelay, reason: string) => {
      if (!isAuthRequiredCloseReason(reason || "")) return;
      nostrDevLog("relay", "Relay closed subscription due to auth failure", {
        relayUrl: relay.url,
        reason,
      });
      const normalizedRelayUrl = relay.url.replace(/\/+$/, "");
      const shouldRetry = shouldRetryAuthAfterReadRejection({
        hasSigner: Boolean(ndk.signer),
        hadPendingAuthChallenge: pendingRelayVerificationRef.current.has(normalizedRelayUrl),
        lastRetryAt: relayAuthRetryHistoryRef.current.get(normalizedRelayUrl),
        now: Date.now(),
      });
      if (shouldRetry) {
        relayAuthRetryHistoryRef.current.set(normalizedRelayUrl, Date.now());
        nostrDevLog("relay", "Retrying relay connection to trigger NIP-42 auth challenge", {
          relayUrl: normalizedRelayUrl,
        });
        connectRelay(normalizedRelayUrl, {
          forceNewSocket: true,
        });
      }
      markRelayVerificationFailure(relay.url, "read", {
        setStatus: shouldSetVerificationFailedStatus("subscription-closed", "read"),
        showToast: true,
      });
    });
    let finished = false;
    const finishRead = () => {
      if (finished) return;
      finished = true;
      endRelayOperation("read");
    };
    subscription.on("eose", finishRead);
    subscription.on("close", finishRead);

    return subscription;
  }, [
    ndkRef,
    beginRelayOperation,
    endRelayOperation,
    markRelayReadOutcome,
    markRelayVerificationFailure,
    connectRelay,
    pendingRelayVerificationRef,
    relayAuthRetryHistoryRef,
  ]);

  const createHttpAuthHeader = useCallback(async (
    url: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  ): Promise<string | null> => {
    return createNip98AuthHeader(ndkRef.current, url, method);
  }, [ndkRef]);

  return { publishEvent, subscribe, createHttpAuthHeader };
}
