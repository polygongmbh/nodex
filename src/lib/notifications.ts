import { toast } from "sonner";
import type { TranslateFn } from "@/lib/i18n/translate";
import type { TaskEntryType } from "@/types";
import { getRelayNameFromUrl } from "@/infrastructure/nostr/relay-identity";

interface PublishSuccessToastOptions {
  relayUrls?: string[];
  spaceNames?: string[];
}

export function notifyNeedSigninModify(t: TranslateFn): void {
  toast.error(t("toasts.errors.needSigninModify"));
}

export function notifyNeedSigninPost(t: TranslateFn): void {
  toast.error(t("toasts.errors.needSigninPost"));
}

export function notifyStatusRestricted(t: TranslateFn): void {
  toast.error(t("toasts.errors.statusRestricted"));
}

export function notifyNeedTag(t: TranslateFn): void {
  toast.error(t("toasts.errors.needTag"));
}

export function notifyTaskCreationFailed(t: TranslateFn): void {
  toast.error(t("toasts.errors.taskCreationFailed"));
}

export function notifyDisconnectedSelectedFeeds(t: TranslateFn): void {
  toast.warning(t("toasts.warnings.disconnectedSelectedFeeds"), { id: "disconnected-selected-feeds" });
}

export function notifyPublished(
  t: TranslateFn,
  taskType: TaskEntryType,
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
    toast.success(t("toasts.success.publishedToSpaces", { spaceNames: resolvedSpaceNames.join(", ") }));
    return;
  }
  toast.success(taskType === "comment" ? t("toasts.success.publishedComment") : t("toasts.success.publishedTask"));
}

export function notifyLocalSaved(t: TranslateFn, taskType: TaskEntryType): void {
  toast.success(taskType === "comment" ? t("toasts.success.localComment") : t("toasts.success.localTask"));
}

interface PublishRetryToastOptions {
  relayUrl?: string;
  reason?: string;
}

export function notifyPartialPublish(t: TranslateFn, options: { publishedCount: number; targetCount: number }): void {
  toast.warning(t("toasts.warnings.partialPublish", options));
}

export function notifyPublishSavedForRetry(t: TranslateFn, options: PublishRetryToastOptions = {}): void {
  const { relayUrl, reason } = options;
  if (relayUrl && reason) {
    toast.error(t("toasts.errors.publishSavedForRetryWithRelayReason", { relayUrl, reason }));
    return;
  }
  if (reason) {
    toast.error(t("toasts.errors.publishSavedForRetryWithReason", { reason }));
    return;
  }
  toast.error(t("toasts.errors.publishSavedForRetry"));
}
