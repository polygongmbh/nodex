import { useMemo } from "react";
import { getStandaloneEmbeddableUrls } from "@/lib/linkify";
import type { Post, PublishedAttachment } from "@/types";

export interface TaskMediaAttachments {
  /** URLs that linkify will render as inline embeds — caller should skip them when listing attachments. */
  standaloneEmbedUrls: Set<string>;
  /** Lowercased URL → caption (from `alt` or `name`). Entries without a real caption are skipped. */
  mediaCaptionByUrl: Map<string, string>;
  /** Task attachments minus the ones already rendered inline. */
  attachmentsWithoutInlineEmbeds: Post["attachments"];
}

export function useTaskMediaAttachments(task: Post): TaskMediaAttachments {
  const standaloneEmbedUrls = useMemo(
    () => new Set(getStandaloneEmbeddableUrls(task.content).map((url) => url.trim().toLowerCase())),
    [task.content]
  );
  const mediaCaptionByUrl = useMemo(() => {
    const captionByUrl = new Map<string, string>();
    for (const attachment of task.attachments || []) {
      const normalizedUrl = attachment.url?.trim().toLowerCase();
      const caption = attachment.alt?.trim() || attachment.name?.trim();
      if (normalizedUrl && caption) {
        captionByUrl.set(normalizedUrl, caption);
      }
    }
    return captionByUrl;
  }, [task.attachments]);
  const attachmentsWithoutInlineEmbeds = useMemo(
    () =>
      (task.attachments || []).filter((attachment) => {
        const normalizedUrl = attachment.url?.trim().toLowerCase();
        return !normalizedUrl || !standaloneEmbedUrls.has(normalizedUrl);
      }),
    [standaloneEmbedUrls, task.attachments]
  );
  return { standaloneEmbedUrls, mediaCaptionByUrl, attachmentsWithoutInlineEmbeds };
}

/**
 * Same filter as {@link useTaskMediaAttachments}'s `attachmentsWithoutInlineEmbeds`,
 * but as a plain function over an immutable Post. Used by the paperclip
 * indicator on cards that don't render the attachment list inline.
 */
export function getPostAttachmentsWithoutInlineEmbeds(post: Post): PublishedAttachment[] {
  const attachments = post.attachments ?? [];
  if (attachments.length === 0) return [];
  const standaloneEmbedUrls = new Set(
    getStandaloneEmbeddableUrls(post.content).map((url) => url.trim().toLowerCase())
  );
  return attachments.filter((attachment) => {
    const normalizedUrl = attachment.url?.trim().toLowerCase();
    return !normalizedUrl || !standaloneEmbedUrls.has(normalizedUrl);
  });
}
