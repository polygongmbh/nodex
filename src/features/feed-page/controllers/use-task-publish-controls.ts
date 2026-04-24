import { useCallback, useMemo } from "react";
import {
  notifyDisconnectedSelectedFeeds,
  notifyNeedSigninModify,
  notifyNeedSigninPost,
  notifyPublishStatusFailed,
  notifyPublishDateFailed,
  notifyPublishPriorityFailed,
} from "@/lib/notifications";
import { resolveOriginRelayIdForTask } from "@/lib/nostr/task-relay-routing";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { isNostrEventId } from "@/lib/nostr/event-id";
import { mapTaskStatusToStateEvent } from "@/infrastructure/nostr/task-state-events";
import { buildLinkedTaskCalendarEvent } from "@/infrastructure/nostr/nip52-task-calendar-events";
import { buildTaskPriorityUpdateEvent } from "@/infrastructure/nostr/task-property-events";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Task, TaskDateType, TaskStatus, Relay } from "@/types";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";
import { resolveRelayUrlsForIds } from "@/infrastructure/nostr/relay-url";

interface PublishResult {
  success: boolean;
  eventId?: string;
  rejectionReason?: string;
  publishedRelayUrls?: string[];
}

interface UseTaskPublishControlsOptions {
  allTasks: Task[];
  relays: Relay[];
  effectiveActiveRelayIds: Set<string>;
  demoFeedActive: boolean;
  canModifyContent: boolean;
  handleOpenAuthModal: () => void;
  publishEvent: (
    kind: number,
    content: string,
    tags?: string[][],
    parentId?: string,
    relayUrls?: string[]
  ) => Promise<PublishResult>;
}

export function useTaskPublishControls({
  allTasks,
  relays,
  effectiveActiveRelayIds,
  demoFeedActive,
  canModifyContent,
  handleOpenAuthModal,
  publishEvent,
}: UseTaskPublishControlsOptions) {
  const hasDisconnectedSelectedRelays = useMemo(() => {
    return relays.some(
      (relay) =>
        effectiveActiveRelayIds.has(relay.id) &&
        relay.id !== "demo" &&
        relay.connectionStatus !== "connected"
    );
  }, [effectiveActiveRelayIds, relays]);

  const isInteractionBlocked = !canModifyContent || hasDisconnectedSelectedRelays;

  const guardInteraction = useCallback((mode: "post" | "modify"): boolean => {
    if (hasDisconnectedSelectedRelays) {
      notifyDisconnectedSelectedFeeds();
      return true;
    }
    if (!canModifyContent) {
      handleOpenAuthModal();
      if (mode === "post") {
        notifyNeedSigninPost();
      } else {
        notifyNeedSigninModify();
      }
      return true;
    }
    return false;
  }, [canModifyContent, handleOpenAuthModal, hasDisconnectedSelectedRelays]);

  const handleBlockedInteractionAttempt = useCallback(() => {
    guardInteraction("modify");
  }, [guardInteraction]);

  const resolveRelayUrlsFromIds = useCallback((relayIds: string[]) => {
    const resolvedRelayUrls = resolveRelayUrlsForIds(relays, relayIds);
    nostrDevLog("routing", "Resolved relay IDs to relay URLs", {
      relayIds,
      resolvedRelayUrls,
    });
    return resolvedRelayUrls;
  }, [relays]);

  const resolveTaskOriginRelay = useCallback((taskId: string) => {
    const task = allTasks.find((item) => item.id === taskId);
    const originRelayId = resolveOriginRelayIdForTask(task, demoFeedActive ? "demo" : undefined);
    if (!originRelayId) {
      nostrDevLog("routing", "No origin relay found for task", { taskId });
      return { relayId: undefined, relayUrls: [] as string[] };
    }
    const relayUrls = resolveRelayUrlsFromIds([originRelayId]);
    nostrDevLog("routing", "Resolved task origin relay", {
      taskId,
      originRelayId,
      relayUrls,
    });
    return {
      relayId: originRelayId,
      relayUrls,
    };
  }, [allTasks, demoFeedActive, resolveRelayUrlsFromIds]);

  const publishTaskStateUpdate = useCallback(async (
    taskId: string,
    status: TaskStatus,
    relayUrlsOverride?: string[]
  ) => {
    if (!isNostrEventId(taskId)) {
      nostrDevLog("publish-state", "Skipping publish for non-Nostr task id", { taskId, status });
      return;
    }

    const relayUrls = relayUrlsOverride && relayUrlsOverride.length > 0
      ? relayUrlsOverride.slice(0, 1)
      : resolveTaskOriginRelay(taskId).relayUrls;

    if (relayUrls.length === 0) {
      nostrDevLog("publish-state", "Skipping publish due to empty relay mapping", { taskId, status });
      return;
    }

    const mapped = mapTaskStatusToStateEvent(status);
    nostrDevLog("publish-state", "Publishing task state update", {
      taskId,
      status: status.type,
      statusDescription: status.description,
      kind: mapped.kind,
      relayUrls,
    });
    const result = await publishEvent(
      mapped.kind,
      mapped.content,
      [["e", taskId, relayUrls[0], "property"]],
      undefined,
      relayUrls
    );

    if (!result.success) {
      notifyPublishStatusFailed();
      console.warn("Status publish failed", { taskId, status, relayUrls });
    }
  }, [publishEvent, resolveTaskOriginRelay]);

  const publishTaskDueUpdate = useCallback(async (
    taskId: string,
    taskContent: string,
    dueDate: Date,
    dueTime?: string,
    dateType: TaskDateType = "due",
    relayUrlsOverride?: string[]
  ) => {
    if (!isNostrEventId(taskId)) return false;
    const relayUrls = relayUrlsOverride && relayUrlsOverride.length > 0
      ? relayUrlsOverride.slice(0, 1)
      : resolveTaskOriginRelay(taskId).relayUrls;
    if (relayUrls.length === 0) {
      notifyPublishDateFailed();
      return false;
    }
    const relayUrl = relayUrls[0];
    const calendarEvent = buildLinkedTaskCalendarEvent({
      taskEventId: taskId,
      taskContent,
      dueDate,
      dueTime,
      dateType,
      relayUrl,
    });
    const result = await publishEvent(
      calendarEvent.kind,
      calendarEvent.content,
      calendarEvent.tags,
      undefined,
      [relayUrl]
    );
    if (!result.success) {
      notifyPublishDateFailed();
      console.warn("Date publish failed", { taskId, relayUrl });
    }
    return result.success;
  }, [publishEvent, resolveTaskOriginRelay]);

  const publishTaskPriorityUpdate = useCallback(async (taskId: string, priority: number) => {
    if (!isNostrEventId(taskId)) return false;
    const { relayUrls } = resolveTaskOriginRelay(taskId);
    if (relayUrls.length === 0) {
      notifyPublishPriorityFailed();
      return false;
    }
    const relayUrl = relayUrls[0];
    const priorityEvent = buildTaskPriorityUpdateEvent({
      taskEventId: taskId,
      priority,
      relayUrl,
    });
    const result = await publishEvent(
      priorityEvent.kind,
      priorityEvent.content,
      priorityEvent.tags,
      undefined,
      [relayUrl]
    );
    if (!result.success) {
      notifyPublishPriorityFailed();
      console.warn("Priority publish failed", { taskId, priority, relayUrl });
    }
    return result.success;
  }, [publishEvent, resolveTaskOriginRelay]);

  const publishTaskCreateFollowUps = useCallback(async (params: {
    publishedEventId?: string;
    taskType: Task["taskType"];
    initialStatus?: TaskStatus;
    dueDate?: Date;
    content: string;
    dueTime?: string;
    dateType?: TaskDateType;
    publishedRelayUrls?: string[];
    fallbackRelayUrls: string[];
  }) => {
    const {
      publishedEventId,
      taskType,
      initialStatus,
      dueDate,
      content,
      dueTime,
      dateType,
      publishedRelayUrls,
      fallbackRelayUrls,
    } = params;
    if (!publishedEventId || taskType !== "task") return;

    const followUpRelayUrls = (
      publishedRelayUrls && publishedRelayUrls.length > 0
        ? publishedRelayUrls
        : fallbackRelayUrls
    ).slice(0, 1);

    if (initialStatus && (initialStatus.type !== "open" || initialStatus.description)) {
      await publishTaskStateUpdate(publishedEventId, initialStatus, followUpRelayUrls);
    }
    if (dueDate) {
      await publishTaskDueUpdate(
        publishedEventId,
        content,
        dueDate,
        dueTime,
        dateType || "due",
        followUpRelayUrls
      );
    }
  }, [publishTaskDueUpdate, publishTaskStateUpdate]);

  return {
    hasDisconnectedSelectedRelays,
    isInteractionBlocked,
    guardInteraction,
    handleBlockedInteractionAttempt,
    resolveRelayUrlsFromIds,
    resolveTaskOriginRelay,
    publishTaskStateUpdate,
    publishTaskDueUpdate,
    publishTaskPriorityUpdate,
    publishTaskCreateFollowUps,
  };
}
