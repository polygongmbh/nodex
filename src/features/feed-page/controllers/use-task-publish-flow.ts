import { getTaskPrimaryDate, isListingPost, isTaskPost, getTaskAssigneePubkeys, getTaskPriority } from "@/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useFailedPublishDraftsStore } from "@/features/feed-page/stores/failed-publish-drafts-store";
import { toast } from "sonner";
import { NOSTR_EVENTS_QUERY_KEY } from "@/infrastructure/nostr/use-nostr-event-cache";
import {   removeCachedNostrEventById, type CachedNostrEvent, } from "@/infrastructure/nostr/event-cache";
import { type FailedPublishDraft } from "@/infrastructure/preferences/failed-publish-drafts-storage";
import {
  extractMentionIdentifiersFromContent,
  normalizeMentionIdentifiers,
  resolveMentionIdentifiersToPubkeysAsync,
} from "@/lib/mentions";
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
import { NostrEventKind } from "@/lib/nostr/types";
import type { SignedNostrEvent } from "@/infrastructure/nostr/provider/use-publish";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { canUserUpdateTask } from "@/domain/content/task-permissions";
import { buildDeletionTags } from "@/infrastructure/nostr/deletion-events";
import {
  notifyLocalSaved,
  notifyNeedCoreTag,
  notifyNeedTag,
  notifyPartialPublish,
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
} from "@/lib/notifications";
import type { FeedInteractionFrecencyIntent } from "@/features/feed-page/controllers/use-feed-interaction-frecency";
import type {
  ComposeRecomposeOf,
  ComposeRestoreRequest,
  ComposeRestoreState,
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
  TaskDateType,
  TaskEntryType,
  TaskState,
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
  queryClient: QueryClient;
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
    dueDate?: Date;
    content: string;
    dueTime?: string;
    dateType?: TaskDateType;
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
  queryClient,
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
    Map<string, { timeoutId: number; toastId: string | number; composeState: ComposeRestoreState }>
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

  useEffect(() => {
    if (suppressedNostrEventIds.size === 0) return;
    const blockedIds = new Set(suppressedNostrEventIds);
    queryClient.setQueriesData<CachedNostrEvent[]>(
      { queryKey: NOSTR_EVENTS_QUERY_KEY },
      (previous) => (previous || []).filter((event) => !blockedIds.has(event.id))
    );
    blockedIds.forEach((eventId) => removeCachedNostrEventById(eventId));
  }, [queryClient, suppressedNostrEventIds]);

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
    queryClient.setQueriesData<CachedNostrEvent[]>(
      { queryKey: NOSTR_EVENTS_QUERY_KEY },
      (previous) => (previous || []).filter((event) => event.id !== normalizedEventId)
    );
    removeCachedNostrEventById(normalizedEventId);
  }, [queryClient, setSuppressedNostrEventIds]);

  const parseStoredDate = useCallback((value?: string): Date | undefined => {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, []);

  const notifyIfPartialPublish = useCallback((targetRelayUrls: string[], publishedRelayUrls?: string[]) => {
    const normalizeUrl = (url: string) => url.replace(/\/+$/, "");
    const targetCount = new Set(targetRelayUrls.map(normalizeUrl)).size;
    const publishedCount = new Set((publishedRelayUrls || []).map(normalizeUrl)).size;
    if (targetCount > 0 && publishedCount > 0 && publishedCount < targetCount) {
      notifyPartialPublish({ publishedCount, targetCount });
      nostrDevLog("publish", "Partial publish acknowledged by subset of target relays", {
        targetRelayUrls,
        publishedRelayUrls: publishedRelayUrls || [],
      });
    }
  }, []);

  const publishRecomposeDeletion = useCallback(async (target: ComposeRecomposeOf): Promise<void> => {
    const targetRelayUrls = resolveRelayUrlsFromIds(target.relayIds);
    const deletionTags = buildDeletionTags({ id: target.eventId, kind: target.originalKind });
    suppressFailedPublishEvent(target.eventId);
    try {
      const result = await publishEvent(NostrEventKind.EventDeletion, "", deletionTags, undefined, targetRelayUrls);
      if (!result.success) {
        notifyPostDeleteFailed();
        return;
      }
      notifyIfPartialPublish(targetRelayUrls, result.publishedRelayUrls);
    } catch (error) {
      console.warn("[recompose] deletion publish failed", { eventId: target.eventId, error });
      notifyPostDeleteFailed();
    }
  }, [notifyIfPartialPublish, publishEvent, resolveRelayUrlsFromIds, suppressFailedPublishEvent]);

  const handleNewTask = useCallback(async (
    content: string,
    extractedTags: string[],
    relayIds: string[],
    taskType: PostType,
    dueDate?: Date,
    dueTime?: string,
    dateType: TaskDateType = "due",
    focusedTaskId: string | null = null,
    initialState?: TaskState,
    explicitMentionPubkeys: string[] = [],
    mentionIdentifiers?: string[],
    priority?: number,
    attachments: PublishedAttachment[] = [],
    nip99?: Nip99Metadata,
    locationGeohash?: string,
    recomposeOf?: ComposeRecomposeOf,
  ): Promise<TaskCreateResult> => {
    const normalizedMessageType = normalizeComposerMessageType(taskType);
    if (normalizedMessageType !== taskType) {
      console.warn("Unexpected taskType payload; defaulting to task", { taskType });
    }

    const normalizedTaskType: TaskEntryType = normalizedMessageType === "task" ? "task" : "comment";
    const requestedRelayIds = relayIds.length > 0
      ? relayIds
      : (demoFeedActive ? [demoRelayId] : []);
    const submissionParentId = recomposeOf ? recomposeOf.parentId ?? null : focusedTaskId;
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
    const submissionDueDate = normalizedTaskType === "task" ? dueDate : undefined;
    const submissionDueTime = normalizedTaskType === "task" ? dueTime : undefined;
    const submissionDateType = normalizedTaskType === "task" ? dateType : undefined;
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

    const publishKind: NostrEventKind =
      normalizedMessageType === "task"
        ? NostrEventKind.Task
        : normalizedMessageType === "listing"
          ? NostrEventKind.ClassifiedListing
          : NostrEventKind.TextNote;
    const validParentId = submissionParentId && /^[a-f0-9]{64}$/i.test(submissionParentId) ? submissionParentId : undefined;
    const primaryRelayUrl = selectedRelayUrls[0] ?? "";
    const publishTags = shouldPublish
      ? (
          normalizedTaskType === "task"
            ? buildTaskPublishTags(
                validParentId,
                primaryRelayUrl,
                assigneePubkeys || [],
                priority,
                resolvedSubmissionTags,
                normalizedAttachments,
                normalizedLocationGeohash
              )
            : normalizedMessageType === "listing"
              ? buildNip99PublishTags({
                  metadata: nip99,
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
      taskType: normalizedTaskType,
      createdAt: createdAt.toISOString(),
      dueDate: submissionDueDate ? submissionDueDate.toISOString() : undefined,
      dueTime: submissionDueTime,
      dateType: submissionDateType,
      parentId: submissionParentId ?? undefined,
      initialState,
      mentionPubkeys,
      assigneePubkeys: normalizedTaskType === "task" ? assigneePubkeys : undefined,
      priority: normalizedTaskType === "task" ? priority : undefined,
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
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
          dates: submissionDueDate
            ? [{ date: submissionDueDate, time: submissionDueTime, type: submissionDateType ?? "due" }]
            : [],
          assigneePubkeys: assigneePubkeys ?? [],
          priority,
        };
        return taskPost;
      }
      if (normalizedMessageType === "listing") {
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
    const composeRestoreState: ComposeRestoreState = {
      content,
      taskType: normalizedTaskType,
      messageType: normalizedMessageType,
      dueDate: submissionDueDate,
      dueTime: submissionDueTime,
      dateType: submissionDateType,
      explicitTagNames: normalizedExtractedTags.filter((tag) => !parsedHashtagsFromContent.has(tag)),
      explicitMentionPubkeys: dedupedExplicitMentionPubkeys,
      selectedRelays: targetRelayIds,
      priority,
      nip99,
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments,
    };

    if (!shouldPublish) {
      setLocalTasks((prev) => [buildPost(Date.now().toString()), ...prev]);
      notifyLocalSaved(publishKind);
      return { ok: true, mode: "local" };
    }

    const publishWithMetadata = async () => {
      nostrDevLog("publish", "Submitting publish request", {
        kind: publishKind,
        parentId: publishParentId || null,
        relayUrls: selectedRelayUrls,
        tagCount: publishTags.length,
      });
      try {
        const result = await publishEvent(publishKind, content, publishTags, publishParentId, selectedRelayUrls);
        nostrDevLog("publish", "Publish request completed", {
          kind: publishKind,
          success: result.success,
          eventId: result.eventId || null,
          rejectionReason: result.rejectionReason || null,
          publishedRelayUrls: result.publishedRelayUrls || [],
          relayUrls: selectedRelayUrls,
        });
        return result;
      } catch (error) {
        console.error("Task publish failed unexpectedly", error);
        nostrDevLog("publish", "Publish request threw an exception", {
          kind: publishKind,
          relayUrls: selectedRelayUrls,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: false,
          eventId: undefined,
          rejectionReason: undefined,
          publishedRelayUrls: undefined,
        };
      }
    };

    if (usePreferencesStore.getState().publishDelayEnabled) {
      const signedEvent = await signEvent(publishKind, content, publishTags, publishParentId);
      if (!signedEvent) {
        const failedDraft = buildFailedPublishDraft(publishKind, publishTags, publishParentId);
        setFailedPublishDrafts((prev) => [failedDraft, ...prev]);
        notifyPublishSavedForRetry({
          relayUrl: selectedRelayUrls.length === 1 ? selectedRelayUrls[0] : undefined,
        });
        return { ok: true, mode: "queued" };
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
        let publishResult: PublishResult;
        try {
          publishResult = await broadcastSignedEvent(signedEvent, selectedRelayUrls);
        } catch (error) {
          console.error("Task broadcast failed unexpectedly", error);
          nostrDevLog("publish", "Broadcast threw an exception", {
            kind: publishKind,
            eventId,
            relayUrls: selectedRelayUrls,
            error: error instanceof Error ? error.message : String(error),
          });
          publishResult = { success: false, eventId };
        }
        if (!publishResult.success) {
          suppressFailedPublishEvent(publishResult.eventId);
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
          dueDate: submissionDueDate,
          content,
          dueTime: submissionDueTime,
          dateType: submissionDateType,
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
        notifyIfPartialPublish(selectedRelayUrls, publishResult.publishedRelayUrls);
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
      return { ok: true, mode: "published" };
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
      return { ok: true, mode: "queued" };
    }

    await publishTaskCreateFollowUps({
      publishedEventId: publishResult.eventId,
      kind: publishKind,
      initialState,
      dueDate: submissionDueDate,
      content,
      dueTime: submissionDueTime,
      dateType: submissionDateType,
      publishedRelayUrls: publishResult.publishedRelayUrls,
      fallbackRelayUrls: selectedRelayUrls,
    });

    setLocalTasks((prev) => {
      const post = buildPost(publishResult.eventId || Date.now().toString());
      const withResolvedRelays: Post = {
        ...post,
        relays: resolvePublishedRelayIds(publishResult.publishedRelayUrls),
      };
      return [withResolvedRelays, ...prev];
    });
    notifyIfPartialPublish(selectedRelayUrls, publishResult.publishedRelayUrls);
    notifyPublished(publishKind, {
      relayUrls: publishResult.publishedRelayUrls?.length ? publishResult.publishedRelayUrls : selectedRelayUrls,
    });
    if (recomposeOf) {
      await publishRecomposeDeletion(recomposeOf);
    }
    return { ok: true, mode: "published" };
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
    notifyIfPartialPublish,
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

    const result = await publishEvent(
      draft.publishKind,
      draft.content,
      draft.publishTags,
      draft.publishParentId,
      relayUrls
    );
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

    notifyIfPartialPublish(relayUrls, result.publishedRelayUrls);
    const effectiveRelayIds = (result.publishedRelayUrls && result.publishedRelayUrls.length > 0
      ? result.publishedRelayUrls
      : relayUrls
    ).map((url) => getRelayIdFromUrl(url));
    const dueDate = parseStoredDate(draft.dueDate);
    const restoredTimestamp = parseStoredDate(draft.createdAt) || new Date();
    const restoredId = result.eventId || Date.now().toString();
    const restoredBase = {
      id: restoredId,
      author: draft.author,
      content: draft.content,
      tags: draft.tags,
      relays: effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [demoRelayId] : []),
      timestamp: restoredTimestamp,
      parentId: draft.parentId,
      mentions: draft.mentionPubkeys,
      locationGeohash: draft.locationGeohash,
      attachments: draft.attachments,
    };
    let restoredTask: Post;
    if (isTaskKind(draft.publishKind)) {
      restoredTask = {
        ...restoredBase,
        kind: NostrEventKind.Task,
        stateUpdates: draft.initialState && draft.initialState.status !== "open"
          ? [{
              id: `local-init-${restoredTimestamp.getTime()}`,
              state: draft.initialState,
              timestamp: restoredTimestamp,
              authorPubkey: draft.author.pubkey,
            }]
          : [],
        dates: dueDate
          ? [{ date: dueDate, time: draft.dueTime, type: draft.dateType ?? "due" }]
          : [],
        assigneePubkeys: draft.assigneePubkeys ?? [],
        priority: draft.priority,
      };
    } else if (isListingKind(draft.publishKind)) {
      restoredTask = {
        ...restoredBase,
        kind: NostrEventKind.ClassifiedListing,
        nip99: { identifier: restoredId, status: "active" },
      };
    } else {
      restoredTask = { ...restoredBase, kind: NostrEventKind.TextNote };
    }
    setLocalTasks((prev) => [restoredTask, ...prev]);
    setFailedPublishDrafts((prev) => prev.filter((item) => item.id !== draftId));

    await publishTaskCreateFollowUps({
      publishedEventId: result.eventId,
      kind: draft.publishKind,
      initialState: draft.initialState,
      dueDate,
      content: draft.content,
      dueTime: draft.dueTime,
      dateType: draft.dateType,
      publishedRelayUrls: result.publishedRelayUrls,
      fallbackRelayUrls: relayUrls,
    });

    notifyPublished(draft.publishKind, {
      relayUrls: result.publishedRelayUrls?.length ? result.publishedRelayUrls : relayUrls,
    });
  }, [
    demoFeedActive,
    demoRelayId,
    failedPublishDrafts,
    guardInteraction,
    notifyIfPartialPublish,
    parseStoredDate,
    publishEvent,
    publishTaskCreateFollowUps,
    setFailedPublishDrafts,
    setLocalTasks,
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
    setLocalTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId || !isTaskPost(task)) return task;
        const otherDates = task.dates.filter((entry) => entry.type !== dateType);
        return {
          ...task,
          dates: [{ date: dueDate, time: dueTime, type: dateType }, ...otherDates],
          lastEditedAt: new Date(),
        };
      })
    );
    void publishTaskDueUpdate(taskId, existingTask.content, dueDate, dueTime, dateType);
  }, [allTasks, currentUser, guardInteraction, publishTaskDueUpdate, setLocalTasks]);

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
    const deletionTags = buildDeletionTags({ id: taskId, kind: existingTask.kind });
    suppressFailedPublishEvent(taskId);
    setLocalTasks((prev) => prev.filter((task) => task.id !== taskId));
    try {
      const result = await publishEvent(NostrEventKind.EventDeletion, "", deletionTags, undefined, targetRelayUrls);
      if (!result.success) {
        notifyPostDeleteFailed();
        return false;
      }
      notifyIfPartialPublish(targetRelayUrls, result.publishedRelayUrls);
      notifyPostDeleted();
      return true;
    } catch (error) {
      console.warn("[delete] publish failed", { taskId, error });
      notifyPostDeleteFailed();
      return false;
    }
  }, [
    allTasks,
    currentUser?.pubkey,
    guardInteraction,
    notifyIfPartialPublish,
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

    const messageType: PostType = isListingKind(existingTask.kind)
      ? "listing"
      : isCommentKind(existingTask.kind)
        ? "comment"
        : "task";
    const taskTypeForComposer: TaskEntryType = messageType === "listing" ? "task" : (messageType as TaskEntryType);

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

    const restoreState: ComposeRestoreState = {
      content: existingTask.content,
      taskType: taskTypeForComposer,
      messageType,
      dueDate: getTaskPrimaryDate(existingTask)?.date,
      dueTime: getTaskPrimaryDate(existingTask)?.time,
      dateType: getTaskPrimaryDate(existingTask)?.type,
      explicitTagNames,
      explicitMentionPubkeys,
      selectedRelays: existingTask.relays,
      priority: getTaskPriority(existingTask),
      attachments: existingTask.attachments,
      nip99: isListingPost(existingTask) ? existingTask.nip99 : undefined,
      locationGeohash: existingTask.locationGeohash,
      recomposeOf: {
        eventId: existingTask.id,
        originalKind: existingTask.kind,
        relayIds: existingTask.relays,
        parentId: existingTask.parentId,
        contentPreview: existingTask.content.slice(0, 120),
      },
    };

    setComposeRestoreRequest({ id: Date.now(), state: restoreState });
  }, [allTasks, currentUser?.pubkey, guardInteraction]);

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

  return {
    composeRestoreRequest,
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
