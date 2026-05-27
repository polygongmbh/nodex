import type { TFunction } from "i18next";
import {
  isCalendarEventPost,
  isCommentPost,
  isListingPost,
  type Post,
} from "@/types";
import { getTaskTooltipPreview } from "@/lib/task-content-preview";

export function getFocusTooltipTypeLabel(t: TFunction, post: Post): string {
  if (isCalendarEventPost(post)) return t("tasks.event.label").toLowerCase();
  if (isListingPost(post)) return t("tasks.listing.label").toLowerCase();
  if (isCommentPost(post)) return t("tasks.comment").toLowerCase();
  return t("tasks.task").toLowerCase();
}

export function getFocusTaskTooltip(t: TFunction, post: Post): string {
  const typeLabel = getFocusTooltipTypeLabel(t, post);
  const preview = getTaskTooltipPreview(post.content);
  if (preview) return t("tasks.focusTaskWithPreview", { type: typeLabel, preview });
  return t("tasks.focusTaskTitle", { type: typeLabel, title: "" });
}
