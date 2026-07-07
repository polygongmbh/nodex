import type {
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
 * wire-resolved tagging — everything `buildPublishPayload` needs to rebuild
 * the event on retry/repost/edit. There is no separate publishKind/
 * publishTags snapshot: replaying a frozen payload verbatim instead of
 * rebuilding from this content was the bug this shape fixes (see
 * plans/failed-publish-draft-rebuild.md).
 */
export type FailedPublishDraft = SerializedComposerContent &
  WireTagging & {
    id: string;
    relayIds: string[];
    relayUrls: string[];
    parentId?: string;
    initialState?: TaskState;
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
  dates: z.array(
    z.union([
      z.object({ date: z.string(), type: taskDateTypeSchema }),
      z.object({ datetime: z.string(), type: taskDateTypeSchema }),
    ])
  ),
  parentId: z.string().optional(),
  initialState: taskStateSchema.optional(),
  mentionPubkeys: z.array(z.string()),
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
  ),
  titledPost: titledPostFieldsSchema.optional(),
  nip99: nip99MetadataSchema.optional(),
  recomposeOf: composeRecomposeOfSchema.optional(),
});
export const failedPublishDraftsSchema = z.array(failedPublishDraftSchema);
