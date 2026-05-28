import { useMemo } from "react";
import { getStandaloneEmbeddableUrls } from "@/lib/linkify";
import { extractUrlsFromContent } from "@/lib/attachments";
import type { Post } from "@/types";

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
 * Count attachments that didn't originate from a bare URL in the body — i.e.
 * real uploads carried by imeta/nip-94 tags, not URLs the converter scraped
 * out of content text. Used by the paperclip indicator on cards that don't
 * render the attachment list inline.
 */
export function getPostRealAttachmentCount(post: Post): number {
  const attachments = post.attachments ?? [];
  if (attachments.length === 0) return 0;
  const contentUrls = new Set(
    extractUrlsFromContent(post.content).map((url) => url.trim().toLowerCase())
  );
  let count = 0;
  for (const attachment of attachments) {
    const url = attachment.url?.trim().toLowerCase();
    if (url && contentUrls.has(url)) continue;
    count += 1;
  }
  return count;
}
