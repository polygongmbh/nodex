import { getStandaloneEmbeddableUrls } from "@/lib/linkify";
import { guessMimeTypeFromUrl, normalizePublishedAttachments } from "@/lib/attachments";
import type { Task } from "@/types";

export type TaskMediaKind = "image" | "video" | "audio";
export type TaskPreviewMediaKind = Exclude<TaskMediaKind, "audio">;

export interface TaskMediaItem {
  key: string;
  taskId: string;
  taskTimestampMs: number;
  taskContent: string;
  url: string;
  kind: TaskMediaKind;
  alt?: string;
  name?: string;
  blurhash?: string;
  thumbnailUrl?: string;
  previewImageUrl?: string;
  dimensions?: string;
  source: "attachment" | "standalone";
}

export interface TaskPreviewMediaItem extends TaskMediaItem {
  kind: TaskPreviewMediaKind;
}

const IMAGE_MIME_PREFIX = "image/";
const VIDEO_MIME_PREFIX = "video/";
const AUDIO_MIME_PREFIX = "audio/";
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mov"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "m4a"]);

function getUrlExtension(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fileName = parsed.pathname.split("/").pop() || "";
    const dot = fileName.lastIndexOf(".");
    if (dot < 0 || dot >= fileName.length - 1) return null;
    return fileName.slice(dot + 1).toLowerCase();
  } catch {
    return null;
  }
}

export function inferTaskMediaKind(url: string, mimeType?: string): TaskMediaKind | null {
  const normalizedMime = mimeType?.toLowerCase() || guessMimeTypeFromUrl(url)?.toLowerCase();
  const extension = getUrlExtension(url);

  if (normalizedMime?.startsWith(IMAGE_MIME_PREFIX)) return "image";
  if (normalizedMime?.startsWith(VIDEO_MIME_PREFIX) || (extension && VIDEO_EXTENSIONS.has(extension))) {
    return "video";
  }
  if (normalizedMime?.startsWith(AUDIO_MIME_PREFIX) || (extension && AUDIO_EXTENSIONS.has(extension))) {
    return "audio";
  }
  return null;
}

export function collectTaskMediaItems(task: Task): TaskMediaItem[] {
  const normalizedAttachments = normalizePublishedAttachments(task.attachments || []);
  const byNormalizedUrl = new Map<string, {
    alt?: string;
    name?: string;
    mimeType?: string;
    blurhash?: string;
    thumbnailUrl?: string;
    previewImageUrl?: string;
    dimensions?: string;
  }>();

  for (const attachment of normalizedAttachments) {
    const normalizedUrl = attachment.url.trim().toLowerCase();
    byNormalizedUrl.set(normalizedUrl, {
      alt: attachment.alt,
      name: attachment.name,
      mimeType: attachment.mimeType,
      blurhash: attachment.blurhash,
      thumbnailUrl: attachment.thumbnailUrl,
      previewImageUrl: attachment.previewImageUrl,
      dimensions: attachment.dimensions,
    });
  }

  const mediaItems: TaskMediaItem[] = [];
  const seenUrls = new Set<string>();

  for (const attachment of normalizedAttachments) {
    const normalizedUrl = attachment.url.trim().toLowerCase();
    if (seenUrls.has(normalizedUrl)) continue;
    const kind = inferTaskMediaKind(attachment.url, attachment.mimeType);
    if (!kind) continue;
    seenUrls.add(normalizedUrl);
    mediaItems.push({
      key: `${task.id}:attachment:${mediaItems.length}`,
      taskId: task.id,
      taskTimestampMs: task.timestamp.getTime(),
      taskContent: task.content,
      url: attachment.url,
      kind,
      alt: attachment.alt,
      name: attachment.name,
      blurhash: attachment.blurhash,
      thumbnailUrl: attachment.thumbnailUrl,
      previewImageUrl: attachment.previewImageUrl,
      dimensions: attachment.dimensions,
      source: "attachment",
    });
  }

  const standaloneUrls = getStandaloneEmbeddableUrls(task.content);
  for (const url of standaloneUrls) {
    const normalizedUrl = url.trim().toLowerCase();
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;
    const attachmentMeta = byNormalizedUrl.get(normalizedUrl);
    const kind = inferTaskMediaKind(url, attachmentMeta?.mimeType);
    if (!kind) continue;
    seenUrls.add(normalizedUrl);
    mediaItems.push({
      key: `${task.id}:standalone:${mediaItems.length}`,
      taskId: task.id,
      taskTimestampMs: task.timestamp.getTime(),
      taskContent: task.content,
      url,
      kind,
      alt: attachmentMeta?.alt,
      name: attachmentMeta?.name,
      blurhash: attachmentMeta?.blurhash,
      thumbnailUrl: attachmentMeta?.thumbnailUrl,
      previewImageUrl: attachmentMeta?.previewImageUrl,
      dimensions: attachmentMeta?.dimensions,
      source: "standalone",
    });
  }

  return mediaItems;
}

export function collectTaskPreviewMediaItems(task: Task): TaskPreviewMediaItem[] {
  return collectTaskMediaItems(task).filter(
    (item): item is TaskPreviewMediaItem => item.kind === "image" || item.kind === "video"
  );
}
