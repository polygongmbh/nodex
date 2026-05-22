import { NostrEventKind } from "@/lib/nostr/types";
import type { PostType, PublishedAttachment, TaskDateType, TaskState } from "@/types";
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
  postType: PostType;
  createdAt: string;
  dateType?: TaskDateType;
  dueDate?: string;
  dueTime?: string;
  parentId?: string;
  initialState?: TaskState;
  mentionPubkeys: string[];
  assigneePubkeys?: string[];
  priority?: number;
  locationGeohash?: string;
  attachments?: PublishedAttachment[];
  publishKind: NostrEventKind;
  publishTags: string[][];
  publishParentId?: string;
}

const postTypeSchema = z.enum(["task", "comment", "listing", "event"] as const);
const taskDateTypeSchema = z.enum(["due", "scheduled", "start", "end", "milestone"] as const);
const taskStatusSchema = z.enum(["open", "active", "done", "closed"] as const);
const taskStateSchema = z.object({
  status: taskStatusSchema,
  description: z.string().optional(),
});
const personSchema = z.object({
  pubkey: z.string(),
  name: z.string(),
  displayName: z.string(),
  nip05: z.string().optional(),
  avatar: z.string().optional(),
});
const failedPublishDraftSchema = z.object({
  id: z.string(),
  author: personSchema,
  content: z.string(),
  tags: z.array(z.string()),
  relayIds: z.array(z.string()),
  relayUrls: z.array(z.string()),
  postType: postTypeSchema,
  createdAt: z.string(),
  dateType: taskDateTypeSchema.optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  parentId: z.string().optional(),
  initialState: taskStateSchema.optional(),
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
