import { NostrEventKind } from "@/lib/nostr/types";
import type { PublishedAttachment, TaskDateType, TaskStatus, TaskType } from "@/types";
import type { Person } from "@/types/person";
import { z } from "zod";

import { FAILED_PUBLISH_DRAFTS_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
export { FAILED_PUBLISH_DRAFTS_STORAGE_KEY };

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
  initialStatus?: TaskStatus;
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
const taskStatusTypeSchema = z.enum(["open", "active", "done", "closed"] as const);
const taskStatusSchema = z.object({
  type: taskStatusTypeSchema,
  description: z.string().optional(),
});
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
  initialStatus: taskStatusSchema.optional(),
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
export const failedPublishDraftsSchema = z.array(failedPublishDraftSchema);
