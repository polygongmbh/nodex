import { toast } from "sonner";
import i18n from "@/lib/i18n/config";
import { NostrEventKind } from "@/lib/nostr/types";
import { isTaskKind } from "@/domain/content/task-kind";
import { getRelayNameFromUrl } from "@/infrastructure/nostr/relay-identity";
import { isPubkeyDerivedPlaceholder, type Person } from "@/types/person";

interface PublishSuccessToastOptions {
  relayUrls?: string[];
  spaceNames?: string[];
}

// Auth

export function notifyNeedSigninModify(): void {
  toast.error(i18n.t("composer:toasts.errors.needSigninModify"));
}

export function notifyNeedSigninPost(): void {
  toast.error(i18n.t("composer:toasts.errors.needSigninPost"));
}

export function notifyStatusRestricted(): void {
  toast.error(i18n.t("composer:toasts.errors.statusRestricted"));
}

export function notifyDisconnectedSelectedFeeds(): void {
  toast.warning(i18n.t("composer:toasts.warnings.disconnectedSelectedFeeds"), { id: "disconnected-selected-feeds" });
}

export function notifyNeedWritableRelay(): void {
  toast.warning(i18n.t("composer:toasts.warnings.noWritableRelay"), { id: "need-writable-relay" });
}

export function notifyTaskActionBlocked(reason?: string): void {
  toast.warning(reason || i18n.t("tasks:tasks.toasts.actionBlocked"), { id: "task-action-blocked" });
}

// Relay filter

export function notifyRelayFilterDisabled(relayDomain: string, options: { onUndo?: () => void } = {}): void {
  toast(i18n.t("composer:toasts.success.relayFilterDisabled", { relayDomain }), buildUndoOption(options.onUndo));
}

export function notifyRelayFilterEnabled(relayDomain: string, options: { onUndo?: () => void } = {}): void {
  toast(i18n.t("composer:toasts.success.relayFilterEnabled", { relayDomain }), buildUndoOption(options.onUndo));
}

export function notifyShowingOnlyRelay(relayDomain: string, options: { onUndo?: () => void } = {}): void {
  toast(i18n.t("composer:toasts.success.showingOnlyRelay", { relayDomain }), buildUndoOption(options.onUndo));
}

export function notifyRelayFiltersCleared(options: { onUndo?: () => void } = {}): void {
  toast(i18n.t("composer:toasts.success.relayFiltersCleared"), buildUndoOption(options.onUndo));
}

export function notifyAllRelaysSelected(options: { onUndo?: () => void } = {}): void {
  toast(i18n.t("composer:toasts.success.allRelaysSelected"), buildUndoOption(options.onUndo));
}

function buildUndoOption(onUndo?: () => void) {
  if (!onUndo) return undefined;
  return {
    action: {
      label: i18n.t("composer:toasts.actions.undo"),
      onClick: onUndo,
    },
  };
}

// Relay reconnect

export function notifyRelayReconnectFailed(relayDomain: string): void {
  toast.error(i18n.t("composer:toasts.errors.relayReconnectFailedDeselected", { relayDomain }));
}

export function notifyRelayReconnectAttempt(relayDomain: string): void {
  toast.info(i18n.t("composer:toasts.info.relayReconnectAttempt", { relayDomain }));
}

// Channel / person filter

interface FilterToastOptions {
  onUndo?: () => void;
}

function withUndoAction(options: FilterToastOptions): { action?: { label: string; onClick: () => void } } {
  if (!options.onUndo) return {};
  return {
    action: {
      label: i18n.t("composer:toasts.actions.undo"),
      onClick: options.onUndo,
    },
  };
}

export function notifyShowingOnlyChannel(channelName: string, options: FilterToastOptions = {}): void {
  toast(i18n.t("composer:toasts.success.showingOnlyChannel", { channelName }), withUndoAction(options));
}

export function notifyAllChannelsReset(options: FilterToastOptions = {}): void {
  toast(i18n.t("composer:toasts.success.allChannelsReset"), withUndoAction(options));
}

export function notifyShowingTag(tag: string, options: FilterToastOptions = {}): void {
  toast(i18n.t("composer:toasts.success.showingTag", { tag }), withUndoAction(options));
}

export function notifyNoFrequentPeople(): void {
  toast(i18n.t("composer:toasts.success.noFrequentPeople"));
}

export function notifyFrequentPeopleDeselected(options: FilterToastOptions = {}): void {
  toast(i18n.t("composer:toasts.success.frequentPeopleDeselected"), withUndoAction(options));
}

function resolvePersonToastName(person?: Person | null): string {
  if (!person) return i18n.t("composer:toasts.success.selectedUserFallback");
  const displayName = person.displayName.trim();
  if (displayName && !isPubkeyDerivedPlaceholder(displayName, person.pubkey)) return displayName;
  const username = person.name.trim();
  if (username && !isPubkeyDerivedPlaceholder(username, person.pubkey)) return username;
  return i18n.t("composer:toasts.success.selectedUserFallback");
}

export function notifyShowingOnlyPersonExclusive(person?: Person | null, options: FilterToastOptions = {}): void {
  toast(
    i18n.t("composer:toasts.success.showingOnlyPersonExclusive", { personName: resolvePersonToastName(person) }),
    withUndoAction(options),
  );
}

export function notifyPersonFilterToggled(
  person: Person | null | undefined,
  wasSelected: boolean,
  options: FilterToastOptions = {},
): void {
  toast(
    i18n.t(
      wasSelected ? "toasts.success.removedPersonFilter" : "toasts.success.showingOnlyPerson",
      { personName: resolvePersonToastName(person) },
    ),
    withUndoAction(options),
  );
}

// Publish: task status / dates / priority

export function notifyPublishStatusFailed(): void {
  toast.error(i18n.t("composer:toasts.errors.publishStatusFailed"));
}

export function notifyPublishDateFailed(): void {
  toast.error(i18n.t("composer:toasts.errors.publishDateFailed"));
}

export function notifyPublishPriorityFailed(): void {
  toast.error(i18n.t("composer:toasts.errors.publishPriorityFailed"));
}

// Publish: listing

export function notifyPublishListingStatusFailed(): void {
  toast.error(i18n.t("composer:toasts.errors.publishListingStatusFailed"));
}

// Publish: new task flow

export function notifyNeedTag(): void {
  toast.error(i18n.t("composer:toasts.errors.needTag"));
}

export function notifyNeedCoreTag(allowedTags: string[]): void {
  const list = allowedTags.map((tag) => `#${tag}`).join(", ");
  toast.error(i18n.t("composer:toasts.errors.needCoreTag", { tags: list }));
}

export function notifySpamRejected(): void {
  toast.error(i18n.t("composer:toasts.errors.spamRejected"), { id: "spam-rejected" });
}

export function notifyTaskCreationFailed(): void {
  toast.error(i18n.t("composer:toasts.errors.taskCreationFailed"));
}

export function notifyRelaySelectionError(errorKey: string): void {
  toast.error(i18n.t(errorKey));
}

export function notifyPendingPublish(durationMs: number, onUndo: () => void): string | number {
  return toast(i18n.t("composer:toasts.info.pendingPublish", { seconds: Math.floor(durationMs / 1000) }), {
    duration: durationMs,
    action: {
      label: i18n.t("composer:toasts.actions.undo"),
      onClick: onUndo,
    },
  });
}

export function notifyPublishUndone(): void {
  toast.info(i18n.t("composer:toasts.success.publishUndone"));
}

export function notifyRetryInProgress(scope: "retry" | "repost"): string | number {
  const message = scope === "repost"
    ? i18n.t("composer:publishQueue.reposting")
    : i18n.t("composer:publishQueue.retrying");
  return toast.loading(message, { id: `failed-publish-${scope}` });
}

export function dismissRetryInProgress(toastId: string | number): void {
  toast.dismiss(toastId);
}

export function notifyRetryRelayMissing(): void {
  toast.error(i18n.t("composer:toasts.errors.retryRelayMissing"));
}

export function notifyRetryRejectedByRelay(reason?: string): void {
  if (reason) {
    toast.error(i18n.t("composer:toasts.errors.retryRejectedByRelayWithReason", { reason }));
  } else {
    toast.error(i18n.t("composer:toasts.errors.retryRejectedByRelay"));
  }
}

export function notifyPublished(
  kind: NostrEventKind,
  options: PublishSuccessToastOptions = {}
): void {
  const resolvedSpaceNames = Array.from(
    new Set(
      [
        ...(options.spaceNames ?? []),
        ...((options.relayUrls ?? []).map((relayUrl) => getRelayNameFromUrl(relayUrl))),
      ]
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  if (resolvedSpaceNames.length > 0) {
    toast.success(i18n.t("composer:toasts.success.publishedToSpaces", { spaceNames: resolvedSpaceNames.join(", ") }));
    return;
  }
  toast.success(isTaskKind(kind) ? i18n.t("composer:toasts.success.publishedTask") : i18n.t("composer:toasts.success.publishedComment"));
}

export function notifyLocalSaved(kind: NostrEventKind): void {
  toast.success(isTaskKind(kind) ? i18n.t("composer:toasts.success.localTask") : i18n.t("composer:toasts.success.localComment"));
}

interface PublishRetryToastOptions {
  relayUrl?: string;
  reason?: string;
}

export function notifyPartialPublish(options: { publishedCount: number; targetCount: number }): void {
  toast.warning(i18n.t("composer:toasts.warnings.partialPublish", options));
}

export function notifyPublishSavedForRetry(options: PublishRetryToastOptions = {}): void {
  const { relayUrl, reason } = options;
  if (relayUrl && reason) {
    toast.error(i18n.t("composer:toasts.errors.publishSavedForRetryWithRelayReason", { relayUrl, reason }));
    return;
  }
  if (reason) {
    toast.error(i18n.t("composer:toasts.errors.publishSavedForRetryWithReason", { reason }));
    return;
  }
  toast.error(i18n.t("composer:toasts.errors.publishSavedForRetry"));
}

export function notifyPostDeleted(): void {
  toast.success(i18n.t("composer:toasts.success.postDeleted"));
}

export function notifyPostDeleteFailed(): void {
  toast.error(i18n.t("composer:toasts.errors.publishDeleteFailed"));
}

export function notifyPermalinkCopied(): void {
  toast.success(i18n.t("composer:toasts.success.permalinkCopied"));
}

export function notifyPermalinkCopyFailed(): void {
  toast.error(i18n.t("composer:toasts.errors.permalinkCopyFailed"));
}
