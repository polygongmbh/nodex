import { TFunction } from "i18next";
import { toast } from "sonner";
import { TaskType } from "@/types";

export function notifyNeedSigninModify(t: TFunction): void {
  toast.error(t("toasts.errors.needSigninModify"));
}

export function notifyNeedSigninPost(t: TFunction): void {
  toast.error(t("toasts.errors.needSigninPost"));
}

export function notifyStatusRestricted(t: TFunction): void {
  toast.error(t("toasts.errors.statusRestricted"));
}

export function notifyNeedTag(t: TFunction): void {
  toast.error(t("toasts.errors.needTag"));
}

export function notifyTaskCreationFailed(t: TFunction): void {
  toast.error(t("toasts.errors.taskCreationFailed"));
}

export function notifyDisconnectedSelectedFeeds(t: TFunction): void {
  toast.warning(t("toasts.warnings.disconnectedSelectedFeeds"), { id: "disconnected-selected-feeds" });
}

export function notifyPublished(t: TFunction, taskType: TaskType): void {
  toast.success(taskType === "comment" ? t("toasts.success.publishedComment") : t("toasts.success.publishedTask"));
}

export function notifyLocalSaved(t: TFunction, taskType: TaskType): void {
  toast.success(taskType === "comment" ? t("toasts.success.localComment") : t("toasts.success.localTask"));
}

interface PublishRetryToastOptions {
  relayUrl?: string;
  reason?: string;
}

export function notifyPublishSavedForRetry(t: TFunction, options: PublishRetryToastOptions = {}): void {
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
