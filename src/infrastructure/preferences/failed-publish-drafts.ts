import { NostrEventKind } from "@/lib/nostr/types";
import type { Person, PublishedAttachment, TaskDateType, TaskInitialStatus, TaskType } from "@/types";
import { z } from "zod";

import { FAILED_PUBLISH_DRAFTS_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
export { FAILED_PUBLISH_DRAFTS_STORAGE_KEY };
const MAX_FAILED_PUBLISH_DRAFTS = 50;

export interface FailedPublishDraft {
  id: string;
  author: Person;
  content: string;
  tags: string[];
  relayIds: string[];
  relayUrls: string[];
  taskType: TaskType;
  createdAt: string;
  dateType?: TaskDateType;
  dueDate?: string;
  dueTime?: string;
  parentId?: string;
  initialStatus?: TaskInitialStatus;
  mentionPubkeys: string[];
  assigneePubkeys?: string[];
  priority?: number;
  locationGeohash?: string;
  attachments?: PublishedAttachment[];
  publishKind: NostrEventKind;
  publishTags: string[][];
  publishParentId?: string;
}

const taskTypeSchema = z.enum(["task", "comment"] as const);
const taskDateTypeSchema = z.enum(["due", "scheduled", "start", "end", "milestone"] as const);
const taskInitialStatusSchema = z.enum(["todo", "in-progress", "done"] as const);
const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  nip05: z.string().optional(),
  avatar: z.string().optional(),
  isOnline: z.boolean(),
  isSelected: z.boolean(),
});
const failedPublishDraftSchema = z.object({
  id: z.string(),
  author: personSchema,
  content: z.string(),
  tags: z.array(z.string()),
  relayIds: z.array(z.string()),
  relayUrls: z.array(z.string()),
  taskType: taskTypeSchema,
  createdAt: z.string(),
  dateType: taskDateTypeSchema.optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  parentId: z.string().optional(),
  initialStatus: taskInitialStatusSchema.optional(),
  mentionPubkeys: z.array(z.string()),
  assigneePubkeys: z.array(z.string()).optional(),
  priority: z.number().finite().optional(),
  locationGeohash: z.string().optional(),
  attachments: z.array(
    z.object({
      url: z.string(),
      mimeType: z.string().optional(),
      sha256: z.string().optional(),
      size: z.number().finite().optional(),
      dimensions: z.string().optional(),
      blurhash: z.string().optional(),
      alt: z.string().optional(),
      name: z.string().optional(),
    })
  ).optional(),
  publishKind: z.number().int(),
  publishTags: z.array(z.array(z.string())),
  publishParentId: z.string().optional(),
});
const failedPublishDraftsSchema = z.array(failedPublishDraftSchema);

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadFailedPublishDrafts(): FailedPublishDraft[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(FAILED_PUBLISH_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = failedPublishDraftsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    return (parsed.data as FailedPublishDraft[]).slice(0, MAX_FAILED_PUBLISH_DRAFTS);
  } catch {
    return [];
  }
}

export function saveFailedPublishDrafts(drafts: FailedPublishDraft[]): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(
      FAILED_PUBLISH_DRAFTS_STORAGE_KEY,
      JSON.stringify(drafts.slice(0, MAX_FAILED_PUBLISH_DRAFTS))
    );
  } catch {
    // Ignore persistence errors and continue.
  }
}
