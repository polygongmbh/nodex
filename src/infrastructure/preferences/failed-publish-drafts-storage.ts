import { NostrEventKind } from "@/lib/nostr/types";
import type {
  PublishedAttachment,
  SerializedComposerContent,
  SerializedTaskDate,
  TaskState,
  WireTagging,
} from "@/types";
import { z } from "zod";

import { FAILED_PUBLISH_DRAFTS_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
export { FAILED_PUBLISH_DRAFTS_STORAGE_KEY };

/** Re-exported under the original name for callers outside this module. */
export type PersistedTaskDate = SerializedTaskDate;

/**
 * A failed-publish draft is the full serialized composer content plus
 * wire-resolved tagging and the publish metadata needed to retry. The
 * `attachments` field is widened to optional here because pre-existing
 * localStorage entries (written before this field was guaranteed) must
 * still load — failed drafts are user state, not a cache the live
 * subscription rebuilds.
 */
type FailedPublishContent = Omit<SerializedComposerContent, "attachments"> & {
  attachments?: PublishedAttachment[];
};

export type FailedPublishDraft = FailedPublishContent &
  WireTagging & {
    id: string;
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
const nip99ListingStatusSchema = z.enum(["active", "sold"] as const);
const taskStateSchema = z.object({
  status: taskStatusSchema,
  description: z.string().optional(),
});
const titledPostFieldsSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
});
const nip99MetadataSchema = z.object({
  identifier: z.string().optional(),
  price: z.string().optional(),
  currency: z.string().optional(),
  frequency: z.string().optional(),
  status: nip99ListingStatusSchema,
  publishedAt: z.string().optional(),
});
const composeRecomposeOfSchema = z.object({
  eventId: z.string(),
  originalKind: z.number().int(),
  dTag: z.string().optional(),
  relayIds: z.array(z.string()),
  parentId: z.string().optional(),
  contentPreview: z.string().optional(),
});
const failedPublishDraftSchema = z.object({
  id: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  relayIds: z.array(z.string()),
  relayUrls: z.array(z.string()),
  postType: postTypeSchema,
  createdAt: z.string(),
  dates: z.array(
    z.union([
      z.object({ date: z.string(), type: taskDateTypeSchema }),
      z.object({ datetime: z.string(), type: taskDateTypeSchema }),
    ])
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
  titledPost: titledPostFieldsSchema.optional(),
  nip99: nip99MetadataSchema.optional(),
  recomposeOf: composeRecomposeOfSchema.optional(),
  publishKind: z.number().int(),
  publishTags: z.array(z.array(z.string())),
  publishParentId: z.string().optional(),
});
export const failedPublishDraftsSchema = z.array(failedPublishDraftSchema);
