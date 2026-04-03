import type { Relay, Task, TaskEntryType } from "@/types";
import { nostrDevLog } from "@/lib/nostr/dev-logs";

export const RELAY_SELECTION_ERROR_KEY = "toasts.errors.selectRelayOrParent";

function dedupeRelayIds(relayIds: string[]): string[] {
  return Array.from(new Set(relayIds.filter(Boolean)));
}

function isPostableRelay(relay: Relay): boolean {
  return relay.connectionStatus === undefined
    || relay.connectionStatus === "connected"
    || relay.connectionStatus === "read-only";
}

function resolveSingleActivePostableRelayId(relays: Relay[], demoRelayId?: string): string | undefined {
  const candidates = relays.filter((relay) =>
    relay.isActive
    && isPostableRelay(relay)
    && (!demoRelayId || relay.id !== demoRelayId)
  );
  return candidates.length === 1 ? candidates[0]?.id : undefined;
}

export function resolveOriginRelayIdForTask(task: Task | undefined, demoRelayId?: string): string | undefined {
  if (!task || task.relays.length === 0) return undefined;
  const nonDemoRelay = demoRelayId
    ? task.relays.find((relayId) => relayId !== demoRelayId)
    : task.relays[0];
  return nonDemoRelay || task.relays[0];
}

export function resolveRelaySelectionForSubmission(params: {
  taskType: TaskEntryType;
  selectedRelayIds: string[];
  relays: Relay[];
  parentTask?: Task;
  demoRelayId?: string;
}): { relayIds: string[]; errorKey?: string } {
  const { taskType, selectedRelayIds, relays, parentTask, demoRelayId } = params;
  const availableRelayIds = new Set(relays.map((relay) => relay.id));
  const normalizedSelectedRelayIds = dedupeRelayIds(selectedRelayIds).filter((relayId) =>
    availableRelayIds.has(relayId)
  );
  const fallbackSingleRelayId = resolveSingleActivePostableRelayId(relays, demoRelayId);
  nostrDevLog("routing", "Evaluating relay selection for submission", {
    taskType,
    selectedRelayIds,
    normalizedSelectedRelayIds,
    hasParentTask: Boolean(parentTask),
    fallbackSingleRelayId: fallbackSingleRelayId || null,
  });

  if (parentTask) {
    const parentOriginRelayId = resolveOriginRelayIdForTask(parentTask, demoRelayId);
    if (parentOriginRelayId) {
      nostrDevLog("routing", "Using parent task origin relay for submission", {
        parentTaskId: parentTask.id,
        parentOriginRelayId,
      });
      return { relayIds: [parentOriginRelayId] };
    }
  }

  if (taskType === "task") {
    const selectedNonDemoRelays = demoRelayId
      ? normalizedSelectedRelayIds.filter((relayId) => relayId !== demoRelayId)
      : normalizedSelectedRelayIds;
    if (selectedNonDemoRelays.length === 0 && fallbackSingleRelayId) {
      return { relayIds: [fallbackSingleRelayId] };
    }
    if (selectedNonDemoRelays.length !== 1) {
      nostrDevLog("routing", "Task submission rejected due to invalid non-demo relay count", {
        selectedNonDemoRelays,
        count: selectedNonDemoRelays.length,
      });
      return { relayIds: normalizedSelectedRelayIds, errorKey: RELAY_SELECTION_ERROR_KEY };
    }
    return { relayIds: [selectedNonDemoRelays[0]] };
  }

  if (normalizedSelectedRelayIds.length === 0) {
    if (fallbackSingleRelayId) {
      return { relayIds: [fallbackSingleRelayId] };
    }
    nostrDevLog("routing", "Comment-like submission rejected due to empty relay selection", {
      taskType,
    });
    return { relayIds: [], errorKey: RELAY_SELECTION_ERROR_KEY };
  }

  return { relayIds: normalizedSelectedRelayIds };
}
