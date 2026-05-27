import { useMemo } from "react";
import { getStandaloneEmbeddableUrls } from "@/lib/linkify";
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
