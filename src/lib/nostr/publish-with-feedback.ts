import type { NostrEventKind } from "@/lib/nostr/types";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { notifyIfPartialPublish } from "@/lib/notifications";
import type { PublishResult, SignedNostrEvent } from "@/infrastructure/nostr/provider/use-publish";

/**
 * The single mechanic every publish site shares: run the publish, swallow exceptions into a
 * normalized failure result, and announce a partial publish when only a subset of the resolved
 * target relays acknowledged. Relay resolution and attribution live in the publish function itself
 * (see use-publish.ts) — callers pass a parent-derived relay OVERRIDE or nothing (defer to selected
 * relays), never an empty array. Site-specific success/failure notifications stay at the call site,
 * because their policy genuinely differs (persist a retry draft vs. toast vs. nothing).
 */

export type EventPublisher = (
  kind: NostrEventKind,
  content: string,
  tags?: string[][],
  parentId?: string,
  relayUrls?: string[],
) => Promise<PublishResult>;

export type EventBroadcaster = (
  event: SignedNostrEvent,
  relayUrls?: string[],
) => Promise<PublishResult>;

export interface PublishWithFeedbackArgs {
  kind: NostrEventKind;
  content: string;
  tags?: string[][];
  parentId?: string;
  /** Parent-derived relay override; omit to defer to the publish fn's selected relays. */
  relayUrls?: string[];
}

async function runWithFeedback(
  fn: () => Promise<PublishResult>,
  label: string,
): Promise<PublishResult> {
  try {
    const result = await fn();
    if (result.success) {
      // The publish fn reports the relay set it actually resolved; partial detection keys off that,
      // so no caller has to re-pass or fabricate a target set.
      notifyIfPartialPublish(result.targetRelayUrls ?? [], result.publishedRelayUrls);
    } else {
      nostrDevLog("publish", `${label} reported no success`, {
        rejectionReason: result.rejectionReason ?? null,
      });
    }
    return result;
  } catch (error) {
    console.error(`${label} failed unexpectedly`, error);
    return { success: false };
  }
}

export function publishWithFeedback(
  publish: EventPublisher,
  args: PublishWithFeedbackArgs,
  label: string,
): Promise<PublishResult> {
  return runWithFeedback(
    () => publish(args.kind, args.content, args.tags, args.parentId, args.relayUrls),
    label,
  );
}

export function broadcastWithFeedback(
  broadcast: EventBroadcaster,
  signedEvent: SignedNostrEvent,
  relayUrls: string[] | undefined,
  label: string,
): Promise<PublishResult> {
  return runWithFeedback(() => broadcast(signedEvent, relayUrls), label);
}
