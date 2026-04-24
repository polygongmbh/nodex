import type { TaskStatus } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  getTaskStateRegistry,
  type TaskStateDefinition,
} from "@/domain/task-states/task-state-config";

const TASK_STATE_EVENT_KINDS = new Set<number>([
  NostrEventKind.GitStatusOpen,
  NostrEventKind.GitStatusApplied,
  NostrEventKind.GitStatusClosed,
  NostrEventKind.GitStatusDraft,
  NostrEventKind.Procedure,
]);

export function isTaskStateEventKind(kind: number): boolean {
  return TASK_STATE_EVENT_KINDS.has(kind);
}

export function extractTaskStateTargetId(tags: string[][]): string | undefined {
  const propertyTag = tags.find((tag) => tag[0] === "e" && tag[1] && tag[3] === "property");
  if (propertyTag?.[1]) return propertyTag[1];
  const fallbackTag = tags.find((tag) => tag[0] === "e" && tag[1]);
  return fallbackTag?.[1];
}

export function mapTaskStatusToStateEvent(
  status: TaskStatus
): { kind: NostrEventKind; content: string } {
  const description = status.description?.trim();
  if (status.type === "done") {
    return { kind: NostrEventKind.GitStatusApplied, content: description || "" };
  }
  if (status.type === "closed") {
    return { kind: NostrEventKind.GitStatusClosed, content: description || "" };
  }
  // Both "open" and "active" map to GitStatusOpen;
  // active states carry a label as content to distinguish from plain open.
  if (status.type === "active") {
    return {
      kind: NostrEventKind.GitStatusOpen,
      content: description || "In Progress",
    };
  }
  return { kind: NostrEventKind.GitStatusOpen, content: description || "" };
}

function findStateByLabel(
  description: string,
  registry: TaskStateDefinition[]
): TaskStateDefinition | undefined {
  const lowered = description.toLowerCase();
  return registry.find(
    (def) => def.label.toLowerCase() === lowered || def.id.toLowerCase() === lowered
  );
}

export function mapTaskStateEventToTaskStatus(
  kind: number,
  content: string,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStatus {
  const description = content.trim() || undefined;
  if (kind === NostrEventKind.GitStatusApplied) {
    return { type: "done", description };
  }
  if (kind === NostrEventKind.GitStatusClosed) {
    return { type: "closed", description };
  }
  if (kind === NostrEventKind.GitStatusOpen || kind === NostrEventKind.GitStatusDraft || kind === NostrEventKind.Procedure) {
    if (!description) return { type: "open" };
    // If the description matches a configured custom state, preserve its semantic type
    // (e.g. "Backlog" stays "open", not coerced to "active").
    const matched = findStateByLabel(description, registry);
    if (matched && (matched.type === "open" || matched.type === "active")) {
      return { type: matched.type, description };
    }
    // Unknown description on an open-kind event: default to active (legacy behavior).
    return { type: "active", description };
  }
  return { type: "open", description };
}
