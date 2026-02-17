import { NostrEventKind } from "./types";

interface TaskPriorityUpdateParams {
  taskEventId: string;
  priority: number;
  relayUrl?: string;
}

function clampPriority(priority: number): number {
  if (!Number.isFinite(priority)) return 0;
  return Math.max(0, Math.min(100, Math.round(priority)));
}

export function buildTaskPriorityUpdateEvent({
  taskEventId,
  priority,
  relayUrl,
}: TaskPriorityUpdateParams): {
  kind: NostrEventKind;
  content: string;
  tags: string[][];
} {
  const normalizedPriority = clampPriority(priority);

  return {
    kind: NostrEventKind.TextNote,
    content: `Priority: ${normalizedPriority}`,
    tags: [
      ["priority", String(normalizedPriority)],
      ["e", taskEventId, relayUrl || "", "property"],
    ],
  };
}
