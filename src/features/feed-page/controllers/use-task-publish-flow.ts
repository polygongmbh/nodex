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
import { resolveNip05Identifier } from "@/lib/nostr/nip05-resolver";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";
import { normalizeComposerMessageType } from "@/domain/content/task-type";
import { resolveSubmissionTags } from "@/lib/submission-tags";
import {   resolveRelaySelectionForSubmission, } from "@/lib/nostr/task-relay-routing";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { normalizeGeohash } from "@/infrastructure/nostr/geohash-location";
import {   buildImetaTag, extractEmbeddableAttachmentsFromContent, normalizePublishedAttachments, } from "@/lib/attachments";
import { buildTaskPublishTags } from "@/infrastructure/nostr/task-publish-tags";
import { buildNip99PublishTags } from "@/infrastructure/nostr/nip99-metadata";
import { NostrEventKind } from "@/lib/nostr/types";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { canUserUpdateTask } from "@/domain/content/task-permissions";
import {
  notifyLocalSaved,
  notifyNeedTag,
  notifyPartialPublish,
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
  ComposeRestoreRequest,
  ComposeRestoreState,
  Nip99Metadata,
  Nip99ListingStatus,
  PostType,
  PublishedAttachment,
  PostedTag,
  Relay,
  Task,
  TaskCreateResult,
  TaskDateType,
  TaskStatus,
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
  allTasks: Task[];
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
    taskType: Task["taskType"];
    initialStatus?: TaskStatus;
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
  publishTaskDueUpdate,
  publishTaskPriorityUpdate,
  publishTaskCreateFollowUps,
}: UseTaskPublishFlowOptions) {
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

  const handleNewTask = useCallback(async (
    content: string,
    extractedTags: string[],
    relayIds: string[],
    taskType: PostType,
    dueDate?: Date,
    dueTime?: string,
    dateType: TaskDateType = "due",
    focusedTaskId: string | null = null,
    initialStatus?: TaskStatus,
    explicitMentionPubkeys: string[] = [],
    mentionIdentifiers?: string[],
    priority?: number,
    attachments: PublishedAttachment[] = [],
    nip99?: Nip99Metadata,
    locationGeohash?: string
  ): Promise<TaskCreateResult> => {
    const normalizedMessageType = normalizeComposerMessageType(taskType);
    if (normalizedMessageType !== taskType) {
      console.warn("Unexpected taskType payload; defaulting to task", { taskType });
    }

    const normalizedTaskType: Task["taskType"] = normalizedMessageType === "task" ? "task" : "comment";
    const feedMessageType: Task["feedMessageType"] =
      normalizedMessageType === "offer" || normalizedMessageType === "request"
        ? normalizedMessageType
        : undefined;
    const requestedRelayIds = relayIds.length > 0
      ? relayIds
      : (demoFeedActive ? [demoRelayId] : []);
    const submissionParentId = focusedTaskId;
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
      id: user?.pubkey || "local-user",
      name: "You",
      displayName: "You",
      isOnline: true,
      isSelected: false,
    };
    const taskAuthor: Person = (() => {
      if (currentUser) return currentUser;
      if (user?.pubkey) {
        return {
          id: user.pubkey,
          name: (user.profile?.name || user.profile?.displayName || user.npub.slice(0, 8)).trim(),
          displayName: (user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`).trim(),
          nip05: user.profile?.nip05?.trim().toLowerCase(),
          avatar: user.profile?.picture,
          isOnline: true,
          onlineStatus: "online",
          isSelected: false,
        };
      }
      return fallbackAuthor;
    })();

    const publishKind: NostrEventKind =
      normalizedMessageType === "task"
        ? NostrEventKind.Task
        : normalizedMessageType === "offer" || normalizedMessageType === "request"
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
            : feedMessageType
              ? buildNip99PublishTags({
                  metadata: nip99,
                  feedMessageType,
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
      initialStatus,
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

    const baseTask: Omit<Task, "id"> = {
      author: taskAuthor,
      content,
      tags: resolvedSubmissionTags,
      relays: effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [demoRelayId] : []),
      taskType: normalizedTaskType,
      timestamp: createdAt,
      status: (normalizedTaskType === "task" ? (initialStatus ?? { type: "open" }) : undefined) as TaskStatus,
      dueDate: submissionDueDate,
      dueTime: submissionDueTime,
      dateType: submissionDateType,
      parentId: submissionParentId ?? undefined,
      mentions: Array.from(new Set([...normalizedMentionIdentifiers, ...mentionPubkeys])),
      assigneePubkeys:
        normalizedTaskType === "task" && (assigneePubkeys?.length || 0) > 0
          ? assigneePubkeys
          : undefined,
      priority: normalizedTaskType === "task" ? priority : undefined,
      feedMessageType,
      nip99: feedMessageType ? nip99 : undefined,
      locationGeohash: normalizedLocationGeohash,
      attachments: normalizedAttachments.length > 0 ? normalizedAttachments : undefined,
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
      setLocalTasks((prev) => [{ ...baseTask, id: Date.now().toString() }, ...prev]);
      notifyLocalSaved(normalizedTaskType);
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
      const pendingTaskId = `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      setLocalTasks((prev) => [
        {
          ...baseTask,
          id: pendingTaskId,
          pendingPublishToken: pendingTaskId,
        },
        ...prev,
      ]);
      setPendingPublishTaskIds((prev) => {
        const next = new Set(prev);
        next.add(pendingTaskId);
        return next;
      });

      const timeoutId = window.setTimeout(async () => {
        clearPendingPublishTask(pendingTaskId, { dismissToast: true });
        const publishResult = await publishWithMetadata();
        if (!publishResult.success) {
          suppressFailedPublishEvent(publishResult.eventId);
          const failedDraft = buildFailedPublishDraft(publishKind, publishTags, publishParentId);
          setFailedPublishDrafts((prev) => [failedDraft, ...prev]);
          setLocalTasks((prev) => prev.filter((task) => task.id !== pendingTaskId));
          notifyPublishSavedForRetry({
            relayUrl: selectedRelayUrls.length === 1 ? selectedRelayUrls[0] : undefined,
            reason: publishResult.rejectionReason,
          });
          return;
        }

        await publishTaskCreateFollowUps({
          publishedEventId: publishResult.eventId,
          taskType: normalizedTaskType,
          initialStatus,
          dueDate: submissionDueDate,
          content,
          dueTime: submissionDueTime,
          dateType: submissionDateType,
          publishedRelayUrls: publishResult.publishedRelayUrls,
          fallbackRelayUrls: selectedRelayUrls,
        });

        setLocalTasks((prev) =>
          prev.map((task) =>
            task.id === pendingTaskId
              ? {
                  ...task,
                  id: publishResult.eventId || task.id,
                  relays: resolvePublishedRelayIds(publishResult.publishedRelayUrls),
                  pendingPublishToken: undefined,
                }
              : task
          )
        );
        notifyIfPartialPublish(selectedRelayUrls, publishResult.publishedRelayUrls);
        notifyPublished(normalizedTaskType, {
          relayUrls: publishResult.publishedRelayUrls?.length ? publishResult.publishedRelayUrls : selectedRelayUrls,
        });
      }, PUBLISH_UNDO_DELAY_MS);

      const toastId = notifyPendingPublish(PUBLISH_UNDO_DELAY_MS, () => handleUndoPendingPublish(pendingTaskId));

      pendingPublishStateRef.current.set(pendingTaskId, { timeoutId, toastId, composeState: composeRestoreState });
      nostrDevLog("publish", "Queued publish with undo delay", {
        pendingTaskId,
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
      taskType: normalizedTaskType,
      initialStatus,
      dueDate: submissionDueDate,
      content,
      dueTime: submissionDueTime,
      dateType: submissionDateType,
      publishedRelayUrls: publishResult.publishedRelayUrls,
      fallbackRelayUrls: selectedRelayUrls,
    });

    setLocalTasks((prev) => [
      {
        ...baseTask,
        id: publishResult.eventId || Date.now().toString(),
        relays: resolvePublishedRelayIds(publishResult.publishedRelayUrls),
      },
      ...prev,
    ]);
    notifyIfPartialPublish(selectedRelayUrls, publishResult.publishedRelayUrls);
    notifyPublished(normalizedTaskType, {
      relayUrls: publishResult.publishedRelayUrls?.length ? publishResult.publishedRelayUrls : selectedRelayUrls,
    });
    return { ok: true, mode: "published" };
  }, [
    allTasks,
    canCreateContent,
    dispatchFrecencyIntent,
    currentUser,
    demoFeedActive,
    demoRelayId,
    guardInteraction,
    handleUndoPendingPublish,
    hasDisconnectedSelectedRelays,
    people,
    publishEvent,
    publishTaskCreateFollowUps,
    relays,
    resolveMentionPubkeys,
    resolveRelayUrlsFromIds,
    setLocalTasks,
    setPostedTags,
    user,
    clearPendingPublishTask,
    notifyIfPartialPublish,
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
    const restoredTask: Task = {
      id: result.eventId || Date.now().toString(),
      author: draft.author,
      content: draft.content,
      tags: draft.tags,
      relays: effectiveRelayIds.length > 0
        ? effectiveRelayIds
        : (demoFeedActive ? [demoRelayId] : []),
      taskType: draft.taskType,
      timestamp: parseStoredDate(draft.createdAt) || new Date(),
      status: (draft.taskType === "task" ? (draft.initialStatus ?? { type: "open" }) : undefined) as TaskStatus,
      dueDate,
      dueTime: draft.dueTime,
      dateType: draft.dateType,
      parentId: draft.parentId,
      mentions: draft.mentionPubkeys,
      assigneePubkeys: draft.taskType === "task" ? draft.assigneePubkeys : undefined,
      priority: draft.taskType === "task" ? draft.priority : undefined,
      locationGeohash: draft.locationGeohash,
      attachments: draft.attachments,
    };
    setLocalTasks((prev) => [restoredTask, ...prev]);
    setFailedPublishDrafts((prev) => prev.filter((item) => item.id !== draftId));

    await publishTaskCreateFollowUps({
      publishedEventId: result.eventId,
      taskType: draft.taskType,
      initialStatus: draft.initialStatus,
      dueDate,
      content: draft.content,
      dueTime: draft.dueTime,
      dateType: draft.dateType,
      publishedRelayUrls: result.publishedRelayUrls,
      fallbackRelayUrls: relayUrls,
    });

    notifyPublished(draft.taskType, {
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
  }, []);

  const handleDismissAllFailedPublish = useCallback(() => {
    setFailedPublishDrafts([]);
  }, []);

  const handleDueDateChange = useCallback((
    taskId: string,
    dueDate: Date | undefined,
    dueTime?: string,
    dateType: TaskDateType = "due"
  ) => {
    if (guardInteraction("modify")) return;
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask || existingTask.taskType !== "task" || !dueDate) return;
    if (!canUserUpdateTask(existingTask, currentUser)) {
      notifyStatusRestricted();
      return;
    }
    setLocalTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, dueDate, dueTime, dateType, lastEditedAt: new Date() }
          : task
      )
    );
    void publishTaskDueUpdate(taskId, existingTask.content, dueDate, dueTime, dateType);
  }, [allTasks, currentUser, guardInteraction, publishTaskDueUpdate, setLocalTasks]);

  const handlePriorityChange = useCallback((taskId: string, priority: number) => {
    if (guardInteraction("modify")) return;
    const existingTask = allTasks.find((task) => task.id === taskId);
    if (!existingTask || existingTask.taskType !== "task") return;
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

  const visibleFailedPublishDrafts = useMemo(() => {
    return failedPublishDrafts.filter((draft) => {
      const targetRelayIds = draft.relayIds.length > 0
        ? draft.relayIds
        : draft.relayUrls.map((url) => getRelayIdFromUrl(url));
      if (targetRelayIds.length === 0) return true;
      return targetRelayIds.some((relayId) => effectiveActiveRelayIds.has(relayId));
    });
  }, [effectiveActiveRelayIds, failedPublishDrafts]);

  const selectedPublishableRelayIds = useMemo(
    () =>
      relays
        .filter((relay) => effectiveActiveRelayIds.has(relay.id))
        .map((relay) => relay.id),
    [effectiveActiveRelayIds, relays]
  );

  return {
    composeRestoreRequest,
    visibleFailedPublishDrafts,
    selectedPublishableRelayIds,
    isPendingPublishTask,
    handleUndoPendingPublish,
    handleNewTask,
    handleRetryFailedPublish,
    handleRepostFailedPublish,
    handleDismissFailedPublish,
    handleDismissAllFailedPublish,
    handleDueDateChange,
    handlePriorityChange,
  };
}
