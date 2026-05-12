import { useCallback } from "react";
import NDK, { NDKEvent, NDKRelaySet } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "@/lib/nostr/types";
import { dedupeNormalizedRelayUrls, normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";
import { extractHashtagsFromContent } from "@/lib/hashtags";
import { extractNostrReferenceTagsFromContent } from "@/lib/nostr/content-references";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import {
  filterRelayUrlsToWritableSet,
  resolveWritableNdkRelayUrls,
} from "@/lib/nostr/relay-write-targets";
import { extractRelayErrorMessage, extractRelayRejectionReason } from "./relay-error";
import { shouldMarkRelayReadOnlyAfterPublishReject } from "./relay-verification";
import type { NDKRelayStatus } from "./contracts";

export type SignedNostrEvent = NDKEvent;

export interface PublishResult {
  success: boolean;
  eventId?: string;
  rejectionReason?: string;
  publishedRelayUrls?: string[];
}

interface UsePublishArgs {
  ndk: NDK | null;
  relays: NDKRelayStatus[];
  resolvedDefaultRelays: string[];
  beginRelayOperation: (op: "read" | "write") => void;
  endRelayOperation: (op: "read" | "write") => void;
  markRelayVerificationFailure: (
    relayUrl: string,
    operation: "read" | "write",
    options: { setStatus: boolean; showToast: boolean }
  ) => void;
  updateRelayCapabilityStatus: (relayUrl: string, status: "connected") => void;
}

export function usePublish({
  ndk,
  relays,
  resolvedDefaultRelays,
  beginRelayOperation,
  endRelayOperation,
  markRelayVerificationFailure,
  updateRelayCapabilityStatus,
}: UsePublishArgs) {
  const signEvent = useCallback(async (
    kind: NostrEventKind,
    content: string,
    tags: string[][] = [],
    parentId?: string
  ): Promise<SignedNostrEvent | null> => {
    if (!ndk || !ndk.signer) {
      console.error("Not authenticated or NDK not ready");
      return null;
    }
    try {
      const event = new NDKEvent(ndk);
      event.kind = kind;
      event.content = content;

      const eventTags: string[][] = [...tags];
      if (parentId) {
        eventTags.push(["e", parentId, "", "reply"]);
      }
      if (kind === NostrEventKind.TextNote || kind === NostrEventKind.Task) {
        extractHashtagsFromContent(content).forEach((hashtag) => {
          eventTags.push(["t", hashtag]);
        });
        extractNostrReferenceTagsFromContent(content).forEach((tag) => {
          eventTags.push(tag);
        });
      }
      event.tags = eventTags;

      await event.sign();
      return event;
    } catch (error) {
      console.error("Failed to sign event:", error);
      return null;
    }
  }, [ndk]);

  const broadcastSignedEvent = useCallback(async (
    event: SignedNostrEvent,
    relayUrls?: string[]
  ): Promise<PublishResult> => {
    if (!ndk) {
      return { success: false, eventId: event.id };
    }
    let targetRelayUrls: string[] = [];
    try {
      beginRelayOperation("write");

      const writableRelayUrls = resolveWritableNdkRelayUrls(relays);
      if (relayUrls && relayUrls.length > 0) {
        targetRelayUrls = filterRelayUrlsToWritableSet(relayUrls, new Set(writableRelayUrls));
      } else if (writableRelayUrls.length > 0) {
        targetRelayUrls = writableRelayUrls;
      } else {
        targetRelayUrls = dedupeNormalizedRelayUrls(resolvedDefaultRelays);
      }
      nostrDevLog("publish", "Preparing publish relay set", {
        kind: event.kind,
        eventTagCount: event.tags.length,
        reason: relayUrls && relayUrls.length > 0 ? "explicit relay override" : "active relays fallback",
        targetRelayUrls,
      });
      if (targetRelayUrls.length === 0) {
        console.warn("Event publish skipped: no writable relay targets available");
        return { success: false, eventId: event.id };
      }
      const publishedRelayUrlSet = new Set<string>();
      let rejectionReason: string | undefined;

      for (const relayUrl of targetRelayUrls) {
        try {
          const relaySet = NDKRelaySet.fromRelayUrls([relayUrl], ndk, true);
          const publishedTo = await event.publish(relaySet, undefined, 1);
          Array.from(publishedTo)
            .map((relay) => normalizeRelayUrl(relay.url))
            .filter(Boolean)
            .forEach((url) => publishedRelayUrlSet.add(url));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error || "");
          const relayErrorMessage = extractRelayErrorMessage(error, relayUrl);
          const extractedReason =
            extractRelayRejectionReason(relayErrorMessage || "") ??
            extractRelayRejectionReason(error);
          if (!rejectionReason && extractedReason) {
            rejectionReason = extractedReason;
          }
          const decisionErrorMessage = relayErrorMessage || errorMessage;
          const shouldMarkReadOnly =
            shouldMarkRelayReadOnlyAfterPublishReject({
              errorMessage: decisionErrorMessage,
              rejectionReason: extractedReason,
            }) ||
            (decisionErrorMessage !== errorMessage &&
              shouldMarkRelayReadOnlyAfterPublishReject({
                errorMessage,
                rejectionReason: extractedReason,
              }));
          if (shouldMarkReadOnly) {
            markRelayVerificationFailure(relayUrl, "write", {
              setStatus: true,
              showToast: false,
            });
          }
          nostrDevLog("publish", "Relay publish attempt failed", {
            relayUrl,
            rejectionReason: extractedReason || null,
            error: decisionErrorMessage,
          });
        }
      }

      const publishedRelayUrls = Array.from(publishedRelayUrlSet);
      if (publishedRelayUrls.length === 0) {
        console.warn("Event publish completed but no relays confirmed receipt");
        return { success: false, eventId: event.id, rejectionReason };
      }

      publishedRelayUrls.forEach((relayUrl) => {
        updateRelayCapabilityStatus(relayUrl, "connected");
      });
      nostrDevLog("publish", "Event published", {
        eventId: event.id,
        kind: event.kind,
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
      return { success: false, eventId: event.id, rejectionReason };
    } finally {
      endRelayOperation("write");
    }
  }, [
    beginRelayOperation,
    endRelayOperation,
    markRelayVerificationFailure,
    ndk,
    relays,
    resolvedDefaultRelays,
    updateRelayCapabilityStatus,
  ]);

  const publishEvent = useCallback(async (
    kind: NostrEventKind,
    content: string,
    tags: string[][] = [],
    parentId?: string,
    relayUrls?: string[]
  ): Promise<PublishResult> => {
    const event = await signEvent(kind, content, tags, parentId);
    if (!event) return { success: false };
    return broadcastSignedEvent(event, relayUrls);
  }, [signEvent, broadcastSignedEvent]);

  return { publishEvent, signEvent, broadcastSignedEvent };
}
