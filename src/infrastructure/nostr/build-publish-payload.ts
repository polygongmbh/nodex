import { getTaskLocalDate } from "@/lib/task-dates";
import { isDateOnlyTaskDate } from "@/types";
import type {
  Nip99ListingStatus,
  Nip99Metadata,
  PostType,
  PublishedAttachment,
  TaskDate,
  TitledPostFields,
} from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { buildImetaTag } from "@/lib/attachments";
import { buildTaskPublishTags } from "@/infrastructure/nostr/task-publish-tags";
import { buildNip99PublishTags } from "@/infrastructure/nostr/nip99-metadata";
import { buildStandaloneCalendarEvent } from "@/infrastructure/nostr/nip52-task-calendar-events";

export interface CalendarTimes {
  startEntry?: TaskDate;
  endEntry?: TaskDate;
  eventStartDateTime?: Date;
  eventEndDateTime?: Date;
  eventIsAllDay: boolean;
}

/**
 * Extract calendar start/end moments from composer dates. `eventIsAllDay` is
 * only meaningful for event submissions — a non-event post is never all-day.
 * Shared by the publish payload builder and the optimistic post construction
 * so both read the same start/end/all-day interpretation.
 */
export function deriveCalendarTimes(dates: TaskDate[], isEventSubmission: boolean): CalendarTimes {
  const startEntry = dates.find((d) => d.type === "start");
  const endEntry = dates.find((d) => d.type === "end");
  const eventStartDateTime = startEntry ? getTaskLocalDate(startEntry) : undefined;
  const eventEndDateTime = endEntry ? getTaskLocalDate(endEntry) : undefined;
  const eventIsAllDay =
    isEventSubmission && (!startEntry || isDateOnlyTaskDate(startEntry)) && (!endEntry || isDateOnlyTaskDate(endEntry));
  return { startEntry, endEntry, eventStartDateTime, eventEndDateTime, eventIsAllDay };
}

export interface PublishPayloadInput {
  content: string;
  postType: PostType;
  dates: TaskDate[];
  /** Resolved submission tags (channel names + extracted hashtags). */
  submissionTags: string[];
  /** Resolved p-tag pubkeys — mentions and, for tasks, assignees are the same set. */
  mentionPubkeys: string[];
  /** Already-normalized attachments. */
  attachments: PublishedAttachment[];
  locationGeohash?: string;
  /** Validated 64-hex parent event id, or undefined. */
  parentId?: string;
  /** Relay URL used as the `e`-tag hint on task/comment parent references. */
  primaryRelayUrl: string;
  priority?: number;
  titledPost?: TitledPostFields;
  nip99?: Nip99Metadata;
}

export interface PublishPayload {
  kind: NostrEventKind;
  content: string;
  tags: string[][];
  parentId?: string;
}

/**
 * Single source of truth for the wire payload of a new post. Both the initial
 * publish and the failed-draft retry build the event here so a retry re-derives
 * the same tags from stored composer content instead of replaying a stale
 * snapshot. All inputs are already resolved (mentions → pubkeys, channels →
 * submission tags, attachments normalized).
 */
export function buildPublishPayload(input: PublishPayloadInput): PublishPayload {
  const {
    content,
    postType,
    submissionTags,
    mentionPubkeys,
    attachments,
    locationGeohash,
    parentId,
    primaryRelayUrl,
    priority,
    titledPost,
    nip99,
  } = input;
  const isEventSubmission = postType === "event";
  const isTaskSubmission = postType === "task";
  const { eventStartDateTime, eventEndDateTime, eventIsAllDay } = deriveCalendarTimes(
    input.dates,
    isEventSubmission
  );

  const eventBuilt = isEventSubmission && eventStartDateTime
    ? buildStandaloneCalendarEvent({
        title: titledPost?.title?.trim() || content.slice(0, 200),
        content,
        start: eventStartDateTime,
        end: eventEndDateTime,
        isAllDay: eventIsAllDay,
        summary: titledPost?.summary?.trim() || undefined,
        location: titledPost?.location?.trim() || undefined,
        mentions: undefined,
      })
    : undefined;

  const kind: NostrEventKind =
    eventBuilt?.kind ??
    (postType === "task"
      ? NostrEventKind.Task
      : postType === "listing"
        ? NostrEventKind.ClassifiedListing
        : NostrEventKind.TextNote);

  const mentionTags: string[][] = mentionPubkeys.map((pubkey) => ["p", pubkey]);
  const hashtagTags: string[][] = submissionTags.map((tag) => ["t", tag]);
  const geohashTags: string[][] = locationGeohash ? [["g", locationGeohash]] : [];
  const imetaTags = attachments.map((attachment) => buildImetaTag(attachment)).filter((tag) => tag.length > 0);

  const tags: string[][] = eventBuilt
    ? [...eventBuilt.tags, ...mentionTags, ...hashtagTags, ...geohashTags]
    : isTaskSubmission
      ? buildTaskPublishTags(
          parentId,
          primaryRelayUrl,
          mentionPubkeys,
          priority,
          submissionTags,
          attachments,
          locationGeohash
        )
      : postType === "listing"
        ? buildNip99PublishTags({
            metadata: nip99,
            titledPost,
            hashtags: submissionTags,
            mentionPubkeys,
            attachmentTags: imetaTags,
            fallbackTitle: content.slice(0, 80),
            statusOverride: (nip99?.status || "active") as Nip99ListingStatus,
            locationGeohash,
          })
        : [...mentionTags, ...hashtagTags, ...imetaTags, ...geohashTags];

  // Only non-task posts thread onto a parent (`normalizedTaskType === "comment"`).
  const resolvedParentId = postType !== "task" && parentId ? parentId : undefined;

  return { kind, content, tags, parentId: resolvedParentId };
}
