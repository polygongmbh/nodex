import type { Relay, Task, TaskEntryType } from "@/types";
import { nostrDevLog } from "@/lib/nostr/dev-logs";

export const RELAY_SELECTION_ERROR_KEY = "toasts.errors.selectRelayOrParent";

function dedupeRelayIds(relayIds: string[]): string[] {
  return Array.from(new Set(relayIds.filter(Boolean)));
}

function isWritableRelay(relay: Relay): boolean {
  return relay.connectionStatus === undefined || relay.connectionStatus === "connected";
}

export function resolveEffectiveWritableRelayIds(params: {
  selectedRelayIds: string[];
  relays: Relay[];
}): string[] {
  const { selectedRelayIds, relays } = params;
  const relayById = new Map(relays.map((relay) => [relay.id, relay] as const));
  const availableRelayIds = new Set(relayById.keys());
  const normalizedSelectedRelayIds = dedupeRelayIds(selectedRelayIds).filter((relayId) =>
    availableRelayIds.has(relayId)
  );
  const writableSelectedRelayIds = normalizedSelectedRelayIds.filter((relayId) => {
    const relay = relayById.get(relayId);
    return relay ? isWritableRelay(relay) : false;
  });
  if (writableSelectedRelayIds.length > 0) {
    return writableSelectedRelayIds;
  }
  const writableRelayIds = relays.filter(isWritableRelay).map((relay) => relay.id);
  return writableRelayIds.length === 1 ? [writableRelayIds[0]] : [];
}

function resolveSingleActiveWritableRelayId(relays: Relay[], demoRelayId?: string): string | undefined {
  const candidates = relays.filter((relay) =>
    relay.isActive
    && isWritableRelay(relay)
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
  const relayById = new Map(relays.map((relay) => [relay.id, relay]));
  const availableRelayIds = new Set(relayById.keys());
  const normalizedSelectedRelayIds = dedupeRelayIds(selectedRelayIds).filter((relayId) =>
    availableRelayIds.has(relayId)
  );
  const writableSelectedRelayIds = normalizedSelectedRelayIds.filter((relayId) => {
    const relay = relayById.get(relayId);
    return relay ? isWritableRelay(relay) : false;
  });
  const fallbackSingleRelayId = resolveSingleActiveWritableRelayId(relays, demoRelayId);
  nostrDevLog("routing", "Evaluating relay selection for submission", {
    taskType,
    selectedRelayIds,
    normalizedSelectedRelayIds,
    writableSelectedRelayIds,
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
      ? writableSelectedRelayIds.filter((relayId) => relayId !== demoRelayId)
      : writableSelectedRelayIds;
    if (selectedNonDemoRelays.length === 0 && fallbackSingleRelayId) {
      return { relayIds: [fallbackSingleRelayId] };
    }
    if (selectedNonDemoRelays.length !== 1) {
      nostrDevLog("routing", "Task submission rejected due to invalid non-demo relay count", {
        selectedNonDemoRelays,
        count: selectedNonDemoRelays.length,
      });
      return { relayIds: writableSelectedRelayIds, errorKey: RELAY_SELECTION_ERROR_KEY };
    }
    return { relayIds: [selectedNonDemoRelays[0]] };
  }

  if (writableSelectedRelayIds.length === 0) {
    if (fallbackSingleRelayId) {
      return { relayIds: [fallbackSingleRelayId] };
    }
    nostrDevLog("routing", "Comment-like submission rejected due to empty relay selection", {
      taskType,
    });
    return { relayIds: [], errorKey: RELAY_SELECTION_ERROR_KEY };
  }

  return { relayIds: writableSelectedRelayIds };
}
