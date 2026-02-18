import { NostrEventKind } from "./types";
import { isTaskStateEventKind } from "./task-state-events";

interface TaskPriorityUpdateParams {
  taskEventId: string;
  priority: number;
  relayUrl?: string;
}

function clampPriority(priority: number): number {
  if (!Number.isFinite(priority)) return 0;
  return Math.max(0, Math.min(100, Math.round(priority)));
}

export function parsePriorityTag(tags: string[][]): number | undefined {
  const priorityTag = tags.find((tag) => tag[0]?.toLowerCase() === "priority" && tag[1]);
  if (!priorityTag?.[1]) return undefined;
  const parsed = Number.parseInt(priorityTag[1], 10);
  if (!Number.isFinite(parsed)) return undefined;
  return clampPriority(parsed);
}

export function extractPriorityTargetTaskId(tags: string[][]): string | undefined {
  const propertyTag = tags.find((tag) => tag[0] === "e" && tag[1] && tag[3] === "property");
  if (propertyTag?.[1]) return propertyTag[1];
  const fallbackTag = tags.find((tag) => tag[0] === "e" && tag[1]);
  return fallbackTag?.[1];
}

export function isPriorityPropertyEvent(kind: number, tags: string[][]): boolean {
  const supportsPropertyTags = kind === NostrEventKind.TextNote || isTaskStateEventKind(kind);
  if (!supportsPropertyTags) return false;
  if (parsePriorityTag(tags) === undefined) return false;
  return Boolean(extractPriorityTargetTaskId(tags));
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
