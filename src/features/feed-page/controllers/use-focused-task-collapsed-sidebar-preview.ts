import { useMemo } from "react";
import { buildTaskViewFilterIndex } from "@/domain/content/task-view-filtering";
import { filterTasksByRelayAndPeople } from "@/domain/content/task-filtering";
import type { Channel, Task } from "@/types";
import type { Person } from "@/types/person";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export interface DeriveFocusedTaskCollapsedSidebarPreviewParams {
  allTasks: Task[];
  focusedTaskId: string | null;
  activeRelayIds: Set<string>;
  channels: Channel[];
  people: Person[];
  allowUnknownRelayMetadata?: boolean;
}

export interface FocusedTaskCollapsedSidebarPreview {
  channels: Channel[];
  people: Person[];
}

export function deriveFocusedTaskCollapsedSidebarPreview({
  allTasks,
  focusedTaskId,
  activeRelayIds,
  channels,
  people,
  allowUnknownRelayMetadata = true,
}: DeriveFocusedTaskCollapsedSidebarPreviewParams): FocusedTaskCollapsedSidebarPreview {
  if (!focusedTaskId) {
    return { channels, people };
  }

  const relayScopedTasks = filterTasksByRelayAndPeople({
    tasks: allTasks,
    activeRelayIds,
    people: [],
    allowUnknownRelayMetadata,
  });

  const filterIndex = buildTaskViewFilterIndex(relayScopedTasks);
  const descendantIds = filterIndex.descendantIdsByTaskId.get(focusedTaskId);
  if (!descendantIds && !relayScopedTasks.some((task) => task.id === focusedTaskId)) {
    return { channels, people };
  }

  const focusedScopeTaskIds = new Set(descendantIds ?? []);
  focusedScopeTaskIds.add(focusedTaskId);

  const focusedScopeTasks = relayScopedTasks.filter((task) => focusedScopeTaskIds.has(task.id));
  const activeChannelIds = new Set(
    focusedScopeTasks.flatMap((task) => task.tags.map((tag) => normalize(tag))).filter(Boolean)
  );
  const activePeopleIds = new Set(
    focusedScopeTasks.map((task) => normalize(task.author?.id || "")).filter(Boolean)
  );

  return {
    channels: channels.filter(
      (channel) => activeChannelIds.has(normalize(channel.id)) || activeChannelIds.has(normalize(channel.name))
    ),
    people: people.filter((person) => activePeopleIds.has(normalize(person.id))),
  };
}

type UseFocusedTaskCollapsedSidebarPreviewOptions =
  DeriveFocusedTaskCollapsedSidebarPreviewParams;

export function useFocusedTaskCollapsedSidebarPreview({
  allTasks,
  focusedTaskId,
  activeRelayIds,
  channels,
  people,
  allowUnknownRelayMetadata = true,
}: UseFocusedTaskCollapsedSidebarPreviewOptions): FocusedTaskCollapsedSidebarPreview {
  return useMemo(
    () =>
      deriveFocusedTaskCollapsedSidebarPreview({
        allTasks,
        focusedTaskId,
        activeRelayIds,
        channels,
        people,
        allowUnknownRelayMetadata,
      }),
    [activeRelayIds, allTasks, allowUnknownRelayMetadata, channels, focusedTaskId, people]
  );
}
