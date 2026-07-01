import {
  getPostDateEntries,
  isCalendarEventPost,
  isDateOnlyTaskDate,
  isDateTimeTaskDate,
  isListingPost,
  isTaskPost,
  getTaskAssigneePubkeys,
  getTaskPriority,
  parseIsoDateLocal,
} from "@/types";
import { getTaskLocalDate } from "@/lib/task-dates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetStateAction } from "react";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useFailedPublishDraftsStore } from "@/features/feed-page/stores/failed-publish-drafts-store";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { toast } from "sonner";
import { type FailedPublishDraft } from "@/infrastructure/preferences/failed-publish-drafts-storage";
import {
  extractMentionIdentifiersFromContent,
  normalizeMentionIdentifiers,
  resolveMentionIdentifiersToPubkeysAsync,
} from "@/lib/mentions";
import { usePosts } from "@/features/feed-page/stores/posts-store";
import { extractHashtagsFromContent } from "@/lib/hashtags";
import { useCoreChannels } from "@/lib/use-core-channels";
import { resolveNip05Identifier } from "@/lib/nostr/nip05-resolver";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";
import { normalizeComposerMessageType } from "@/domain/content/task-type";
import { isCommentKind, isListingKind, isTaskKind } from "@/domain/content/task-kind";
import { resolveSubmissionTags } from "@/lib/submission-tags";
import {   resolveRelaySelectionForSubmission, } from "@/lib/nostr/task-relay-routing";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { normalizeGeohash } from "@/infrastructure/nostr/geohash-location";
import {   buildImetaTag, extractEmbeddableAttachmentsFromContent, normalizePublishedAttachments, } from "@/lib/attachments";
import { buildTaskPublishTags } from "@/infrastructure/nostr/task-publish-tags";
import { buildNip99PublishTags } from "@/infrastructure/nostr/nip99-metadata";
import { buildStandaloneCalendarEvent } from "@/infrastructure/nostr/nip52-task-calendar-events";
import { NostrEventKind } from "@/lib/nostr/types";
import type { SignedNostrEvent } from "@/infrastructure/nostr/provider/use-publish";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { canUserUpdateTask } from "@/domain/content/task-permissions";
import { displayPriorityFromStored } from "@/domain/content/task-priority";
import { buildDeletionTags } from "@/infrastructure/nostr/deletion-events";
import { publishWithFeedback, broadcastWithFeedback } from "@/lib/nostr/publish-with-feedback";
import {
  notifyNeedCoreTag,
  notifyNeedTag,
  notifyPostDeleted,
  notifyPostDeleteFailed,
  notifyPublished,
  notifyPublishSavedForRetry,
  notifyStatusRestricted,
  notifyRelaySelectionError,
  notifyPendingPublish,
  notifyPublishUndone,
  notifyRetryRelayMissing,
  notifyRetryRejectedByRelay,
  notifyTaskCreationFailed,
  notifyRecomposeRelaysUnavailable,
} from "@/lib/notifications";
import type { FeedInteractionFrecencyIntent } from "@/features/feed-page/controllers/use-feed-interaction-frecency";
import type {
  ComposeRecomposeOf,
  ComposeRestoreRequest,
  ComposerDraft,
  DateBasedEventPost,
  Nip99Metadata,
  Nip99ListingStatus,
  Post,
  PostType,
  PublishedAttachment,
  PostedTag,
  Relay,
  TaskPost,
  CommentPost,
  ListingPost,
  TaskCreateResult,
  TaskDate,
  TaskDateType,
  TaskEntryType,
  TaskState,
  TaskCreatePayload,
  TimeBasedEventPost,
  TitledPostFields,
} from "@/types";
import type { Person } from "@/types/person";

const PUBLISH_UNDO_DELAY_MS = 5000;


interface PublishResult {
  success: boolean;
  eventId?: string;
  rejectionReason?: string;
  publishedRelayUrls?: string[];
}

interface SessionUser {
  pubkey: string;
  npub: string;
  profile?: {
    name?: string;
    displayName?: string;
    nip05?: string;
    picture?: string;
  };
}

interface UseTaskPublishFlowOptions {
  allTasks: Post[];
  relays: Relay[];
  people: Person[];
  currentUser?: Person;
  user: SessionUser | null | undefined;
  canCreateContent: boolean;
  effectiveActiveRelayIds: Set<string>;
  demoFeedActive: boolean;
  demoRelayId: string;
  dispatchFrecencyIntent: (intent: FeedInteractionFrecencyIntent) => void;
  guardInteraction: (mode: "post" | "modify") => boolean;
  hasDisconnectedSelectedRelays: boolean;
  resolveRelayUrlsFromIds: (relayIds: string[]) => string[];
  publishEvent: (
    kind: number,
    content: string,
    tags?: string[][],
    parentId?: string,
    relayUrls?: string[]
  ) => Promise<PublishResult>;
  signEvent: (
    kind: number,
    content: string,
    tags?: string[][],
    parentId?: string
  ) => Promise<SignedNostrEvent | null>;
  broadcastSignedEvent: (
    event: SignedNostrEvent,
    relayUrls?: string[]
  ) => Promise<PublishResult>;
  publishTaskDueUpdate: (
    taskId: string,
    taskContent: string,
    dueDate: Date,
    dueTime?: string,
    dateType?: TaskDateType,
    relayUrlsOverride?: string[]
  ) => Promise<boolean>;
  publishTaskPriorityUpdate: (taskId: string, priority: number) => Promise<boolean>;
  publishTaskCreateFollowUps: (params: {
    publishedEventId?: string;
    kind: NostrEventKind;
    initialState?: TaskState;
    dates: TaskDate[];
    content: string;
    publishedRelayUrls?: string[];
    fallbackRelayUrls: string[];
  }) => Promise<void>;
}

export function useTaskPublishFlow({
  allTasks,
  relays,
  people,
  currentUser,
  user,
  canCreateContent,
  effectiveActiveRelayIds,
  demoFeedActive,
  demoRelayId,
  dispatchFrecencyIntent,
  guardInteraction,
  hasDisconnectedSelectedRelays,
  resolveRelayUrlsFromIds,
  publishEvent,
  signEvent,
  broadcastSignedEvent,
  publishTaskDueUpdate,
  publishTaskPriorityUpdate,
  publishTaskCreateFollowUps,
}: UseTaskPublishFlowOptions) {
  const { coreChannels, isCore } = useCoreChannels();
  const setLocalTasks = useTaskMutationStore((s) => s.setLocalTasks);
  const setPostedTags = useTaskMutationStore((s) => s.setPostedTags);
  const suppressedNostrEventIds = useTaskMutationStore((s) => s.suppressedNostrEventIds);
  const setSuppressedNostrEventIds = useTaskMutationStore((s) => s.setSuppressedNostrEventIds);
  const failedPublishDrafts = useFailedPublishDraftsStore((s) => s.failedPublishDrafts);
  const setFailedPublishDrafts = useFailedPublishDraftsStore((s) => s.setFailedPublishDrafts);

  const [pendingPublishTaskIds, setPendingPublishTaskIds] = useState<Set<string>>(new Set());
  const [composeRestoreRequest, setComposeRestoreRequest] = useState<ComposeRestoreRequest | null>(null);
  const pendingPublishStateRef = useRef<
    Map<string, { timeoutId: number; toastId: string | number; composeState: ComposerDraft }>
  >(new Map());

  useEffect(() => {
    const pendingPublishState = pendingPublishStateRef.current;
    return () => {
      for (const pending of pendingPublishState.values()) {
        window.clearTimeout(pending.timeoutId);
        toast.dismiss(pending.toastId);
      }
      pendingPublishState.clear();
    };
  }, []);

  // The only producer of localTasks now is the publish-undo window (event is
  // signed but broadcast is deferred). Once the broadcast lands and the live
  // round-trip ingests the event into the posts-store, drop the placeholder
  // so dedupeMergedTasks can't keep showing the stale snapshot.
  const livePosts = usePosts();
  useEffect(() => {
    if (livePosts.length === 0) return;
    const liveIds = new Set(livePosts.map((post) => post.id));
    setLocalTasks((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((task) => !liveIds.has(task.id));
      return next.length === prev.length ? prev : next;
    });
  }, [livePosts, setLocalTasks]);

  const resolveMentionPubkeys = useCallback(async (mentionIdentifiers: string[]): Promise<string[]> => {
    return resolveMentionIdentifiersToPubkeysAsync(mentionIdentifiers, people, {
      resolveNip05: resolveNip05Identifier,
    });
  }, [people]);

  const isPendingPublishTask = useCallback((taskId: string) => {
    return pendingPublishTaskIds.has(taskId);
  }, [pendingPublishTaskIds]);

  const clearPendingPublishTask = useCallback((taskId: string, options?: { dismissToast?: boolean }) => {
    const pending = pendingPublishStateRef.current.get(taskId);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    if (options?.dismissToast !== false) {
      toast.dismiss(pending.toastId);
    }
    pendingPublishStateRef.current.delete(taskId);
    setPendingPublishTaskIds((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  const handleUndoPendingPublish = useCallback((taskId: string) => {
    const pending = pendingPublishStateRef.current.get(taskId);
    if (!pending) return;
    setComposeRestoreRequest({
      id: Date.now(),
      state: pending.composeState,
    });
    clearPendingPublishTask(taskId);
    setLocalTasks((prev) => prev.filter((task) => task.id !== taskId));
    notifyPublishUndone();
  }, [clearPendingPublishTask, setLocalTasks]);

  const suppressFailedPublishEvent = useCallback((eventId?: string) => {
    const normalizedEventId = (eventId || "").trim();
    if (!normalizedEventId) return;
    setSuppressedNostrEventIds((previous) => {
      if (previous.has(normalizedEventId)) return previous;
      const next = new Set(previous);
      next.add(normalizedEventId);
      return next;
    });
  }, [setSuppressedNostrEventIds]);

  const parseStoredDate = useCallback((value?: string): Date | undefined => {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, []);

  const publishRecomposeDeletion = useCallback(async (target: ComposeRecomposeOf): Promise<void> => {
    const targetRelayUrls = resolveRelayUrlsFromIds(target.relayIds);
    const deletionTags = buildDeletionTags({
      id: target.eventId,
      kind: target.originalKind,
      pubkey: currentUser?.pubkey,
      dTag: target.dTag,
    });
    suppressFailedPublishEvent(target.eventId);
    const result = await publishWithFeedback(publishEvent, {
      kind: NostrEventKind.EventDeletion,
      content: "",
      tags: deletionTags,
      relayUrls: targetRelayUrls,
    }, "[recompose] deletion");
    if (!result.success) {
      notifyPostDeleteFailed();
    }
  }, [currentUser?.pubkey, publishEvent, resolveRelayUrlsFromIds, suppressFailedPublishEvent]);

  const handleNewTask = useCallback(async (
    payload: TaskCreatePayload,
  ): Promise<TaskCreateResult> => {
    const {
      content,
      tags: extractedTags,
      relays: relayIds,
      postType,
      dates,
      focusedTaskId = null,
      initialState,
      explicitMentionPubkeys = [],
      mentionIdentifiers,
      priority,
      attachments = [],
      titledPost,
      nip99,
      locationGeohash,
      recomposeOf,
    } = payload;
    const normalizedPostType = normalizeComposerMessageType(postType);
    if (normalizedPostType !== postType) {
      console.warn("Unexpected postType payload; defaulting to task", { postType });
    }

    const normalizedTaskType: TaskEntryType = normalizedPostType === "task" ? "task" : "comment";
    const isEventSubmission = normalizedPostType === "event";
    const startEntry = dates.find((d) => d.type === "start");
    const endEntry = dates.find((d) => d.type === "end");
    const eventStartDateTime = startEntry ? getTaskLocalDate(startEntry) : undefined;
    const eventEndDateTime = endEntry ? getTaskLocalDate(endEntry) : undefined;
    const eventIsAllDay =
      isEventSubmission && (!startEntry || isDateOnlyTaskDate(startEntry)) && (!endEntry || isDateOnlyTaskDate(endEntry));
    const requestedRelayIds = relayIds.length > 0
      ? relayIds
      : (demoFeedActive ? [demoRelayId] : []);
    const submissionParentId =
      recomposeOf && focusedTaskId === recomposeOf.eventId
        ? recomposeOf.parentId ?? null
        : focusedTaskId;
    const parentTask = submissionParentId ? allTasks.find((task) => task.id === submissionParentId) : undefined;
    const resolvedRelaySelection = resolveRelaySelectionForSubmission({
      taskType: normalizedTaskType,
      selectedRelayIds: requestedRelayIds,
      relays,
      parentTask,
      demoRelayId: demoFeedActive ? demoRelayId : undefined,
    });
    const shouldAllowDisconnectedRelayBypass =
      hasDisconnectedSelectedRelays
      && normalizedTaskType !== "task"
      && !parentTask
      && !resolvedRelaySelection.errorKey;

    if (!canCreateContent) {
      guardInteraction("post");
      return { ok: false, reason: "not-authenticated" };
    }

    if (!shouldAllowDisconnectedRelayBypass && guardInteraction("post")) {
      return hasDisconnectedSelectedRelays
        ? { ok: false, reason: "relay-selection" }
        : { ok: false, reason: "not-authenticated" };
    }

    const normalizedExtractedTags = Array.from(
      new Set(extractedTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))
    );
    const { submissionTags: resolvedSubmissionTags } = resolveSubmissionTags(normalizedExtractedTags, parentTask);
    if (resolvedSubmissionTags.length === 0) {
      notifyNeedTag();
      return { ok: false, reason: "missing-tag" };
    }
    if (!parentTask && coreChannels.size > 0 && !resolvedSubmissionTags.some(isCore)) {
      notifyNeedCoreTag(Array.from(coreChannels));
      return { ok: false, reason: "missing-core-tag" };
    }
    if (resolvedRelaySelection.errorKey) {
      notifyRelaySelectionError(resolvedRelaySelection.errorKey);
      nostrDevLog("routing", "Relay selection rejected for submission", {
        taskType: normalizedTaskType,
        requestedRelayIds,
        parentId: submissionParentId || null,
        errorKey: resolvedRelaySelection.errorKey,
      });
      return { ok: false, reason: "relay-selection" };
    }

    const targetRelayIds = resolvedRelaySelection.relayIds;
    setPostedTags((prev) => {
      const preserved = prev.filter((entry) => !resolvedSubmissionTags.includes(entry.name));
      return [
        ...preserved,
        ...resolvedSubmissionTags.map((tag) => ({ name: tag, relayIds: targetRelayIds })),
      ];
    });
    resolvedSubmissionTags.forEach((tag) =>
      dispatchFrecencyIntent({ type: "channel.bump", tag, weight: 1.1 })
    );
    const hasNonDemoRelay = demoFeedActive
      ? targetRelayIds.some((id) => id !== demoRelayId)
      : targetRelayIds.length > 0;
    const selectedRelayUrls = resolveRelayUrlsFromIds(targetRelayIds);
    nostrDevLog("routing", "Resolved relay selection for submission", {
      taskType: normalizedTaskType,
      requestedRelayIds,
      targetRelayIds,
      selectedRelayUrls,
      hasNonDemoRelay,
      parentId: submissionParentId || null,
    });

    const shouldPublish = hasNonDemoRelay && selectedRelayUrls.length > 0;
    const dedupedExplicitMentionPubkeys = Array.from(
      new Set(
        explicitMentionPubkeys
          .map((pubkey) => pubkey.trim().toLowerCase())
          .filter((pubkey) => /^[a-f0-9]{64}$/i.test(pubkey))
      )
    );
    const normalizedMentionIdentifiers = normalizeMentionIdentifiers(
      mentionIdentifiers === undefined
        ? extractMentionIdentifiersFromContent(content)
        : mentionIdentifiers
    );
    const resolvedMentionPubkeys = await resolveMentionPubkeys(normalizedMentionIdentifiers);
    const mentionPubkeys = Array.from(new Set([...resolvedMentionPubkeys, ...dedupedExplicitMentionPubkeys]));
    const assigneePubkeys = normalizedTaskType === "task"
      ? Array.from(new Set(mentionPubkeys))
      : undefined;
    const normalizedLocationGeohash = normalizeGeohash(locationGeohash);
    const contentDerivedAttachments = extractEmbeddableAttachmentsFromContent(content);
    const normalizedAttachments = normalizePublishedAttachments([
      ...attachments,
      ...contentDerivedAttachments,
    ]);

    const createdAt = new Date();
    const fallbackAuthor: Person = people[0] || {
      pubkey: user?.pubkey || "local-user",
      name: "You",
      displayName: "You",
    };
    const taskAuthor: Person = (() => {
      if (currentUser) return currentUser;
      if (user?.pubkey) {
        return {
          pubkey: user.pubkey,
          name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
          displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
          nip05: user.profile?.nip05?.trim().toLowerCase(),
          avatar: user.profile?.picture,
        };
      }
      return fallbackAuthor;
    })();

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
    const publishKind: NostrEventKind =
      eventBuilt?.kind ??
      (normalizedPostType === "task"
        ? NostrEventKind.Task
        : normalizedPostType === "listing"
          ? NostrEventKind.ClassifiedListing
          : NostrEventKind.TextNote);
    const validParentId = submissionParentId && /^[a-f0-9]{64}$/i.test(submissionParentId) ? submissionParentId : undefined;
    const primaryRelayUrl = selectedRelayUrls[0] ?? "";
    const publishTags = shouldPublish
      ? (
          eventBuilt
            ? [
                ...eventBuilt.tags,
                ...mentionPubkeys.map((pubkey) => ["p", pubkey] as string[]),
                ...resolvedSubmissionTags.map((tag) => ["t", tag] as string[]),
                ...((normalizedLocationGeohash ? [["g", normalizedLocationGeohash]] : []) as string[][]),
              ]
            : normalizedTaskType === "task"
              ? buildTaskPublishTags(
                  validParentId,
                  primaryRelayUrl,
                  assigneePubkeys || [],
                  priority,
                  resolvedSubmissionTags,
                  normalizedAttachments,
                  normalizedLocationGeohash
                )
              : normalizedPostType === "listing"
                ? buildNip99PublishTags({
                    metadata: nip99,
                    titledPost,
                    hashtags: resolvedSubmissionTags,
                    mentionPubkeys,
                    attachmentTags: normalizedAttachments
                      .map((attachment) => buildImetaTag(attachment))
                      .filter((tag) => tag.length > 0),
                    fallbackTitle: content.slice(0, 80),
                    statusOverride: (nip99?.status || "active") as Nip99ListingStatus,
                    locationGeohash: normalizedLocationGeohash,
                  })
                : [
                    ...mentionPubkeys.map((pubkey) => ["p", pubkey] as string[]),
                    ...resolvedSubmissionTags.map((tag) => ["t", tag] as string[]),
                    ...normalizedAttachments
                      .map((attachment) => buildImetaTag(attachment))
                      .filter((tag) => tag.length > 0),
                    ...((normalizedLocationGeohash ? [["g", normalizedLocationGeohash]] : []) as string[][]),
                  ]
        )
      : [];
    const publishParentId =
      shouldPublish && normalizedTaskType === "comment" && validParentId ? validParentId : undefined;

    const buildFailedPublishDraft = (
      fallbackKind: NostrEventKind,
      fallbackTags: string[][],
      fallbackParentId?: string
    ): FailedPublishDraft => ({
      id: `failed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      author: taskAuthor,
      content,
      tags: resolvedSubmissionTags,
      relayIds: targetRelayIds,
      relayUrls: selectedRelayUrls,
      postType: normalizedPostType,
      createdAt: createdAt.toISOString(),
      dates: dates.map((entry) =>
        isDateTimeTaskDate(entry)
          ? { datetime: entry.datetime.toISOString(), type: entry.type }
          : { date: entry.date, type: entry.type }
      ),
      parentId: submissionParentId ?? undefined,
      initialState,
      mentionPubkeys,
      assigneePubkeys: normalizedTaskType === "task" ? assigneePubkeys : undefined,
      priority: normalizedTaskType === "task" ? priority : undefined,
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
      titledPost,
      nip99,
      recomposeOf,
      publishKind: fallbackKind,
      publishTags: fallbackTags,
      publishParentId: fallbackParentId,
    });

    const effectiveRelayIds = targetRelayIds.length > 0
      ? targetRelayIds
      : selectedRelayUrls.map((url) => getRelayIdFromUrl(url));
    const resolvePublishedRelayIds = (publishedRelayUrls?: string[]): string[] => {
      if (!publishedRelayUrls || publishedRelayUrls.length === 0) {
        return effectiveRelayIds.length > 0
          ? effectiveRelayIds
          : (demoFeedActive ? [demoRelayId] : []);
      }
      const ids = publishedRelayUrls.map((url) => getRelayIdFromUrl(url)).filter(Boolean);
      if (ids.length > 0) return ids;
      return effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [demoRelayId] : []);
    };

    const baseFields = {
      author: taskAuthor,
      content,
      tags: resolvedSubmissionTags,
      relays: effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [demoRelayId] : []),
      timestamp: createdAt,
      parentId: submissionParentId ?? undefined,
      mentions: Array.from(new Set([...normalizedMentionIdentifiers, ...mentionPubkeys])),
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
    };
    const buildPost = (id: string): Post => {
      if (isEventSubmission && eventStartDateTime && eventBuilt) {
        const titledBase = {
          ...baseFields,
          id,
          title: titledPost?.title?.trim() || undefined,
          summary: titledPost?.summary?.trim() || undefined,
          location: titledPost?.location?.trim() || undefined,
        };
        if (eventIsAllDay) {
          const toIso = (date: Date): string => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, "0");
            const d = String(date.getDate()).padStart(2, "0");
            return `${y}-${m}-${d}`;
          };
          const dateBasedPost: DateBasedEventPost = {
            ...titledBase,
            kind: NostrEventKind.CalendarDateBased,
            startDate: toIso(eventStartDateTime),
            endDate: eventEndDateTime ? toIso(eventEndDateTime) : undefined,
          };
          return dateBasedPost;
        }
        const timeBasedPost: TimeBasedEventPost = {
          ...titledBase,
          kind: NostrEventKind.CalendarTimeBased,
          start: eventStartDateTime,
          end: eventEndDateTime,
        };
        return timeBasedPost;
      }
      if (normalizedTaskType === "task") {
        const taskPost: TaskPost = {
          ...baseFields,
          id,
          kind: NostrEventKind.Task,
          stateUpdates: initialState && initialState.status !== "open"
            ? [{
                id: `local-init-${createdAt.getTime()}`,
                state: initialState,
                timestamp: createdAt,
                authorPubkey: taskAuthor.pubkey,
              }]
            : [],
          dates,
          assigneePubkeys: assigneePubkeys ?? [],
          priority,
        };
        return taskPost;
      }
      if (normalizedPostType === "listing") {
        const listingPost: ListingPost = {
          ...baseFields,
          id,
          kind: NostrEventKind.ClassifiedListing,
          nip99: nip99 ?? { identifier: id, status: "active" },
        };
        return listingPost;
      }
      const commentPost: CommentPost = {
        ...baseFields,
        id,
        kind: NostrEventKind.TextNote,
      };
      return commentPost;
    };

    const parsedHashtagsFromContent = new Set(extractHashtagsFromContent(content));
    const composeRestoreState: ComposerDraft = {
      content,
      postType: normalizedPostType,
      dates,
      titledPost: { ...(titledPost ?? {}) },
      nip99: nip99 ?? { status: "active" },
      attachments: normalizedAttachments,
      explicitTagNames: normalizedExtractedTags.filter((tag) => !parsedHashtagsFromContent.has(tag)),
      explicitMentionPubkeys: dedupedExplicitMentionPubkeys,
      selectedRelays: targetRelayIds,
      priority: displayPriorityFromStored(priority),
      locationGeohash: normalizedLocationGeohash,
    };

    if (!shouldPublish) {
      notifyTaskCreationFailed();
      return { ok: false, reason: "relay-selection" };
    }

    const publishWithMetadata = () => {
      nostrDevLog("publish", "Submitting publish request", {
        kind: publishKind,
        parentId: publishParentId || null,
        relayUrls: selectedRelayUrls,
        tagCount: publishTags.length,
      });
      // The primitive owns exception-safety + partial-publish notify; relay attribution comes back
      // on the result. Only the draft-persist-on-failure / notifyPublished-on-success policy is ours.
      return publishWithFeedback(publishEvent, {
        kind: publishKind,
        content,
        tags: publishTags,
        parentId: publishParentId,
        relayUrls: selectedRelayUrls,
      }, "task publish");
    };

    if (usePreferencesStore.getState().publishDelayEnabled) {
      const signedEvent = await signEvent(publishKind, content, publishTags, publishParentId);
      if (!signedEvent) {
        const failedDraft = buildFailedPublishDraft(publishKind, publishTags, publishParentId);
        setFailedPublishDrafts((prev) => [failedDraft, ...prev]);
        notifyPublishSavedForRetry({
          relayUrl: selectedRelayUrls.length === 1 ? selectedRelayUrls[0] : undefined,
        });
        return { ok: true };
      }
      const eventId = signedEvent.id;
      setLocalTasks((prev) => [buildPost(eventId), ...prev]);
      setPendingPublishTaskIds((prev) => {
        const next = new Set(prev);
        next.add(eventId);
        return next;
      });

      const timeoutId = window.setTimeout(async () => {
        clearPendingPublishTask(eventId, { dismissToast: true });
        nostrDevLog("publish", "Broadcasting pre-signed event", {
          kind: publishKind,
          eventId,
          relayUrls: selectedRelayUrls,
        });
        const publishResult = await broadcastWithFeedback(broadcastSignedEvent, signedEvent, selectedRelayUrls, "task broadcast");
        if (!publishResult.success) {
          suppressFailedPublishEvent(eventId);
          const failedDraft = buildFailedPublishDraft(publishKind, publishTags, publishParentId);
          setFailedPublishDrafts((prev) => [failedDraft, ...prev]);
          setLocalTasks((prev) => prev.filter((task) => task.id !== eventId));
          notifyPublishSavedForRetry({
            relayUrl: selectedRelayUrls.length === 1 ? selectedRelayUrls[0] : undefined,
            reason: publishResult.rejectionReason,
          });
          return;
        }

        await publishTaskCreateFollowUps({
          publishedEventId: publishResult.eventId,
          kind: publishKind,
          initialState,
          dates,
          content,
          publishedRelayUrls: publishResult.publishedRelayUrls,
          fallbackRelayUrls: selectedRelayUrls,
        });

        setLocalTasks((prev) =>
          prev.map((task) =>
            task.id === eventId
              ? { ...task, relays: resolvePublishedRelayIds(publishResult.publishedRelayUrls) }
              : task
          )
        );
        notifyPublished(publishKind, {
          relayUrls: publishResult.publishedRelayUrls?.length ? publishResult.publishedRelayUrls : selectedRelayUrls,
        });
        if (recomposeOf) {
          await publishRecomposeDeletion(recomposeOf);
        }
      }, PUBLISH_UNDO_DELAY_MS);

      const toastId = notifyPendingPublish(PUBLISH_UNDO_DELAY_MS, () => handleUndoPendingPublish(eventId));

      pendingPublishStateRef.current.set(eventId, { timeoutId, toastId, composeState: composeRestoreState });
      nostrDevLog("publish", "Queued publish with undo delay", {
        eventId,
        delayMs: PUBLISH_UNDO_DELAY_MS,
        relayUrls: selectedRelayUrls,
      });
      return { ok: true };
    }

    const publishResult = await publishWithMetadata();
    if (!publishResult.success) {
      suppressFailedPublishEvent(publishResult.eventId);
      const failedDraft = buildFailedPublishDraft(publishKind, publishTags, publishParentId);
      setFailedPublishDrafts((prev) => [failedDraft, ...prev]);
      notifyPublishSavedForRetry({
        relayUrl: selectedRelayUrls.length === 1 ? selectedRelayUrls[0] : undefined,
        reason: publishResult.rejectionReason,
      });
      return { ok: true };
    }

    await publishTaskCreateFollowUps({
      publishedEventId: publishResult.eventId,
      kind: publishKind,
      initialState,
      dates,
      content,
      publishedRelayUrls: publishResult.publishedRelayUrls,
      fallbackRelayUrls: selectedRelayUrls,
    });

    notifyPublished(publishKind, {
      relayUrls: publishResult.publishedRelayUrls?.length ? publishResult.publishedRelayUrls : selectedRelayUrls,
    });
    if (recomposeOf) {
      await publishRecomposeDeletion(recomposeOf);
    }
    return { ok: true };
  }, [
    allTasks,
    canCreateContent,
    coreChannels,
    dispatchFrecencyIntent,
    currentUser,
    isCore,
    demoFeedActive,
    demoRelayId,
    guardInteraction,
    handleUndoPendingPublish,
    hasDisconnectedSelectedRelays,
    people,
    publishEvent,
    signEvent,
    broadcastSignedEvent,
    publishTaskCreateFollowUps,
    relays,
    resolveMentionPubkeys,
    resolveRelayUrlsFromIds,
    setFailedPublishDrafts,
    setLocalTasks,
    setPostedTags,
    user,
    clearPendingPublishTask,
    publishRecomposeDeletion,
    suppressFailedPublishEvent,
  ]);

  const publishFailedDraft = useCallback(async (
    draftId: string,
    resolveRelayUrls: (draft: FailedPublishDraft) => string[]
  ) => {
    if (guardInteraction("modify")) return;
    const draft = failedPublishDrafts.find((item) => item.id === draftId);
    if (!draft) return;

    const relayUrls = resolveRelayUrls(draft);
    if (relayUrls.length === 0) {
      notifyRetryRelayMissing();
      return;
    }

    const result = await publishWithFeedback(publishEvent, {
      kind: draft.publishKind,
      content: draft.content,
      tags: draft.publishTags,
      parentId: draft.publishParentId,
      relayUrls,
    }, "retry publish");
    if (!result.success) {
      if (result.eventId) {
        nostrDevLog("publish", "Suppressing retry-failed event from cache and feed", {
          draftId,
          eventId: result.eventId,
        });
      }
      suppressFailedPublishEvent(result.eventId);
      notifyRetryRejectedByRelay(result.rejectionReason);
      return;
    }

    setFailedPublishDrafts((prev) => prev.filter((item) => item.id !== draftId));

    const draftDates: TaskDate[] = draft.dates
      .map((entry): TaskDate | null => {
        if ("datetime" in entry) {
          const moment = parseStoredDate(entry.datetime);
          return moment ? { datetime: moment, type: entry.type } : null;
        }
        return parseIsoDateLocal(entry.date) ? { date: entry.date, type: entry.type } : null;
      })
      .filter((entry): entry is TaskDate => entry !== null);
    await publishTaskCreateFollowUps({
      publishedEventId: result.eventId,
      kind: draft.publishKind,
      initialState: draft.initialState,
      dates: draftDates,
      content: draft.content,
      publishedRelayUrls: result.publishedRelayUrls,
      fallbackRelayUrls: relayUrls,
    });

    notifyPublished(draft.publishKind, {
      relayUrls: result.publishedRelayUrls?.length ? result.publishedRelayUrls : relayUrls,
    });
  }, [
    failedPublishDrafts,
    guardInteraction,
    parseStoredDate,
    publishEvent,
    publishTaskCreateFollowUps,
    setFailedPublishDrafts,
    suppressFailedPublishEvent,
  ]);

  const handleRetryFailedPublish = useCallback(async (draftId: string) => {
    await publishFailedDraft(draftId, (draft) =>
      draft.relayUrls.length > 0
        ? draft.relayUrls
        : resolveRelayUrlsFromIds(draft.relayIds)
    );
  }, [publishFailedDraft, resolveRelayUrlsFromIds]);

  const handleRepostFailedPublish = useCallback(async (draftId: string) => {
    await publishFailedDraft(draftId, () => resolveRelayUrlsFromIds(Array.from(effectiveActiveRelayIds)));
  }, [effectiveActiveRelayIds, publishFailedDraft, resolveRelayUrlsFromIds]);

  const handleDismissFailedPublish = useCallback((draftId: string) => {
    setFailedPublishDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
  }, [setFailedPublishDrafts]);

  const handleDismissAllFailedPublish = useCallback(() => {
    setFailedPublishDrafts([]);
  }, [setFailedPublishDrafts]);

  const handleDueDateChange = useCallback((
    taskId: string,
    dueDate: Date | undefined,
    dueTime?: string,
    dateType: TaskDateType = "due"
  ) => {
    if (guardInteraction("modify")) return;
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask || !isTaskPost(existingTask) || !dueDate) return;
    if (!canUserUpdateTask(existingTask, currentUser)) {
      notifyStatusRestricted();
      return;
    }
    void publishTaskDueUpdate(taskId, existingTask.content, dueDate, dueTime, dateType);
  }, [allTasks, currentUser, guardInteraction, publishTaskDueUpdate]);

  const handlePostDelete = useCallback(async (taskId: string): Promise<boolean> => {
    if (guardInteraction("modify")) return false;
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask) return false;
    const ownerPubkey = existingTask.author.pubkey.trim().toLowerCase();
    const userPubkey = currentUser?.pubkey?.trim().toLowerCase() || "";
    if (!userPubkey || userPubkey !== ownerPubkey) {
      notifyStatusRestricted();
      return false;
    }
    const targetRelayUrls = resolveRelayUrlsFromIds(existingTask.relays);
    const deletionTags = buildDeletionTags({
      id: taskId,
      kind: existingTask.kind,
      pubkey: existingTask.author.pubkey,
      dTag: (existingTask as { dTag?: string }).dTag,
    });
    suppressFailedPublishEvent(taskId);
    setLocalTasks((prev) => prev.filter((task) => task.id !== taskId));
    const result = await publishWithFeedback(publishEvent, {
      kind: NostrEventKind.EventDeletion,
      content: "",
      tags: deletionTags,
      relayUrls: targetRelayUrls,
    }, "[delete] publish");
    if (!result.success) {
      notifyPostDeleteFailed();
      return false;
    }
    notifyPostDeleted();
    return true;
  }, [
    allTasks,
    currentUser?.pubkey,
    guardInteraction,
    publishEvent,
    resolveRelayUrlsFromIds,
    setLocalTasks,
    suppressFailedPublishEvent,
  ]);

  const handleRecomposeTask = useCallback((taskId: string): void => {
    if (guardInteraction("modify")) return;
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask) return;
    const ownerPubkey = existingTask.author.pubkey.trim().toLowerCase();
    const userPubkey = currentUser?.pubkey?.trim().toLowerCase() || "";
    if (!userPubkey || userPubkey !== ownerPubkey) {
      notifyStatusRestricted();
      return;
    }

    const postType: PostType = isListingKind(existingTask.kind)
      ? "listing"
      : isCalendarEventPost(existingTask)
        ? "event"
        : isCommentKind(existingTask.kind)
          ? "comment"
          : "task";

    let restoreTitle: string | undefined;
    let restoreSummary: string | undefined;
    let restoreLocation: string | undefined;
    if (isCalendarEventPost(existingTask) || isListingPost(existingTask)) {
      restoreTitle = existingTask.title;
      restoreSummary = existingTask.summary;
      restoreLocation = existingTask.location;
    }

    const inlineHashtags = new Set(extractHashtagsFromContent(existingTask.content).map((tag) => tag.toLowerCase()));
    const explicitTagNames = (existingTask.tags || [])
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag && !inlineHashtags.has(tag));

    const explicitMentionPubkeys = Array.from(
      new Set(
        [...(getTaskAssigneePubkeys(existingTask) || []), ...(existingTask.mentions || [])]
          .map((value) => value.trim().toLowerCase())
          .filter((value) => /^[a-f0-9]{64}$/i.test(value))
      )
    );

    const knownRelayIds = new Set(relays.map((relay) => relay.id));
    const matchingRelayIds = existingTask.relays.filter((id) => knownRelayIds.has(id));
    if (matchingRelayIds.length > 0) {
      useFilterStore.getState().setActiveRelayIds(new Set(matchingRelayIds));
    } else {
      notifyRecomposeRelaysUnavailable();
    }

    const restoreState: ComposerDraft = {
      content: existingTask.content,
      postType,
      dates: getPostDateEntries(existingTask),
      titledPost: {
        title: restoreTitle,
        summary: restoreSummary,
        location: restoreLocation,
      },
      nip99: isListingPost(existingTask) ? existingTask.nip99 : {},
      attachments: existingTask.attachments ?? [],
      explicitTagNames,
      explicitMentionPubkeys,
      priority: displayPriorityFromStored(getTaskPriority(existingTask)),
      locationGeohash: existingTask.locationGeohash,
      recomposeOf: {
        eventId: existingTask.id,
        originalKind: existingTask.kind,
        dTag: (existingTask as { dTag?: string }).dTag,
        relayIds: existingTask.relays,
        parentId: existingTask.parentId,
        contentPreview: existingTask.content.slice(0, 120),
      },
    };

    setComposeRestoreRequest({ id: Date.now(), state: restoreState });
  }, [allTasks, currentUser?.pubkey, guardInteraction, relays]);

  const handlePriorityChange = useCallback((taskId: string, priority: number) => {
    if (guardInteraction("modify")) return;
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask || !isTaskPost(existingTask)) return;
    if (!canUserUpdateTask(existingTask, currentUser)) {
      notifyStatusRestricted();
      return;
    }
    setLocalTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, priority, lastEditedAt: new Date() }
          : task
      )
    );
    void publishTaskPriorityUpdate(taskId, priority);
  }, [allTasks, currentUser, guardInteraction, publishTaskPriorityUpdate, setLocalTasks]);

  const handleComposeRestoreRequestConsumed = useCallback((requestId: number) => {
    setComposeRestoreRequest((current) => (current?.id === requestId ? null : current));
  }, []);

  return {
    composeRestoreRequest,
    onComposeRestoreRequestConsumed: handleComposeRestoreRequestConsumed,
    isPendingPublishTask,
    handleUndoPendingPublish,
    handleNewTask,
    handleRetryFailedPublish,
    handleRepostFailedPublish,
    handleDismissFailedPublish,
    handleDismissAllFailedPublish,
    handleDueDateChange,
    handlePriorityChange,
    handlePostDelete,
    handleRecomposeTask,
  };
}
