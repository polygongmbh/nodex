import type { TFunction } from "i18next";
import { getTaskStatus, type TaskState } from "@/types";
import { getAlternateModifierLabel } from "@/lib/keyboard-platform";

export function getStatusToggleHint(t: TFunction, status?: TaskState): string {
  const alternateKey = getAlternateModifierLabel();
  const statusType = getTaskStatus(status);
  if (statusType === "active") return t("hints.statusToggle.active", { alternateKey });
  if (statusType === "done") return t("hints.statusToggle.done");
  if (statusType === "closed") return t("hints.statusToggle.closed");
  return t("hints.statusToggle.open", { alternateKey });
}
