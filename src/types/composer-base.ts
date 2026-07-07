import type {
  ComposeRecomposeOf,
  Nip99Metadata,
  PostType,
  PublishedAttachment,
  TaskDate,
  TaskDateType,
  TitledPostFields,
} from "@/types";

/**
 * Serialized shape of a single {@link TaskDate}. Mirrors the in-memory
 * discriminated union — calendar-date entries persist as `YYYY-MM-DD`
 * strings (already what they are in memory), datetime entries persist
 * via `toISOString()` so the moment is preserved.
 */
export type SerializedTaskDate =
  | { date: string; type: TaskDateType }
  | { datetime: string; type: TaskDateType };

/**
 * Universal post content — identical across every stage of the composer
 * pipeline (in-memory draft, submit form, publish payload, persisted draft,
 * failed-publish queue entry). Only fields with no naming or shape
 * differences across those stages belong here.
 *
 * `priority` is the display tier (1-5). The storage layer rescales to 0-100;
 * the field name and type are unchanged.
 */
export interface ComposerContent {
  content: string;
  postType: PostType;
  dates: TaskDate[];
  priority?: number;
  attachments: PublishedAttachment[];
  titledPost?: TitledPostFields;
  nip99?: Nip99Metadata;
  locationGeohash?: string;
  recomposeOf?: ComposeRecomposeOf;
}

/**
 * Serialized variant of {@link ComposerContent}: dates become ISO strings.
 * Everything else is preserved as-is.
 */
export type SerializedComposerContent = Omit<ComposerContent, "dates"> & {
  dates: SerializedTaskDate[];
};

/**
 * Tagging shape for in-memory draft state — what the user is currently
 * editing. Channel/hashtag names are kept separate from the post body and
 * are merged into the wire-ready `tags` array at submit time.
 */
export interface DraftTagging {
  explicitTagNames: string[];
  explicitMentionPubkeys: string[];
}

/**
 * Tagging shape at form-submit and publish-payload stages. `tags` is the
 * already-resolved string array (channel names + extracted hashtags);
 * mentions are still carried alongside as both pubkeys and display
 * identifiers because resolution to a single canonical identifier happens
 * inside the publish flow.
 */
export interface SubmitTagging {
  tags: string[];
  explicitMentionPubkeys: string[];
  mentionIdentifiers: string[];
}

/**
 * Wire-ready tagging — only stored on failed-publish entries that have
 * already gone through the publish flow. `tags` is the resolved submission
 * tags (channels + extracted hashtags); `mentionPubkeys` is the flat p-tag
 * pubkey list (mentions and, for tasks, assignees are the same set).
 */
export interface WireTagging {
  tags: string[];
  mentionPubkeys: string[];
}
