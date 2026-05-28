import { NostrEventKind } from "@/lib/nostr/types";
import type {
  PublishedAttachment,
  SerializedComposerContent,
  SerializedTaskDate,
  TaskState,
  WireTagging,
} from "@/types";
import type { Person } from "@/types/person";
import { z } from "zod";

import { FAILED_PUBLISH_DRAFTS_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
export { FAILED_PUBLISH_DRAFTS_STORAGE_KEY };

/** Re-exported under the original name for callers outside this module. */
export type PersistedTaskDate = SerializedTaskDate;

/**
 * Subset of {@link SerializedComposerContent} actually stored on the failed-
 * publish queue. `titledPost` / `nip99` / `recomposeOf` are intentionally
 * dropped — the retry path reconstructs them from `publishTags`. Adding a
 * new core composer field that should round-trip through retry requires
 * extending this Pick list (and the Zod schema below).
 */
type FailedPublishContent = Pick<
  SerializedComposerContent,
  "content" | "postType" | "dates" | "priority" | "locationGeohash"
> & {
  attachments?: PublishedAttachment[];
};

export type FailedPublishDraft = FailedPublishContent &
  WireTagging & {
    id: string;
    author: Person;
    createdAt: string;
    relayIds: string[];
    relayUrls: string[];
    parentId?: string;
    initialState?: TaskState;
    publishKind: NostrEventKind;
    publishTags: string[][];
    publishParentId?: string;
  };

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
  dates: z.array(
    z.object({
      date: z.string(),
      time: z.string().optional(),
      type: taskDateTypeSchema,
    })
  ),
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
