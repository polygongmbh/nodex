import type { Relay, Task, TaskType } from "@/types";

export const RELAY_SELECTION_ERROR_MESSAGE = "Select one relay or a parent task";

function dedupeRelayIds(relayIds: string[]): string[] {
  return Array.from(new Set(relayIds.filter(Boolean)));
}

export function resolveOriginRelayIdForTask(task: Task | undefined, demoRelayId: string): string | undefined {
  if (!task || task.relays.length === 0) return undefined;
  const nonDemoRelay = task.relays.find((relayId) => relayId !== demoRelayId);
  return nonDemoRelay || task.relays[0];
}

export function resolveRelaySelectionForSubmission(params: {
  taskType: TaskType;
  selectedRelayIds: string[];
  relays: Relay[];
  parentTask?: Task;
  demoRelayId: string;
}): { relayIds: string[]; error?: string } {
  const { taskType, selectedRelayIds, relays, parentTask, demoRelayId } = params;
  const availableRelayIds = new Set(relays.map((relay) => relay.id));
  const normalizedSelectedRelayIds = dedupeRelayIds(selectedRelayIds).filter((relayId) =>
    availableRelayIds.has(relayId)
  );

  if (parentTask) {
    const parentOriginRelayId = resolveOriginRelayIdForTask(parentTask, demoRelayId);
    if (parentOriginRelayId) {
      return { relayIds: [parentOriginRelayId] };
    }
  }

  if (taskType === "task") {
    const selectedNonDemoRelays = normalizedSelectedRelayIds.filter((relayId) => relayId !== demoRelayId);
    if (selectedNonDemoRelays.length !== 1) {
      return { relayIds: normalizedSelectedRelayIds, error: RELAY_SELECTION_ERROR_MESSAGE };
    }
    return { relayIds: [selectedNonDemoRelays[0]] };
  }

  return {
    relayIds: normalizedSelectedRelayIds.length > 0 ? normalizedSelectedRelayIds : [demoRelayId],
  };
}
