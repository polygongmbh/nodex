import type { TaskStatus } from "@/types";
import { NostrEventKind } from "./types";

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
  status: TaskStatus,
  description?: string
): { kind: NostrEventKind; content: string } {
  if (status === "done") {
    return { kind: NostrEventKind.GitStatusApplied, content: description?.trim() || "" };
  }
  if (status === "closed") {
    return { kind: NostrEventKind.GitStatusClosed, content: description?.trim() || "" };
  }
  if (status === "in-progress") {
    return {
      kind: NostrEventKind.GitStatusOpen,
      content: description?.trim() || "In Progress",
    };
  }
  return { kind: NostrEventKind.GitStatusOpen, content: description?.trim() || "" };
}

export function mapTaskStateEventToTaskStatus(
  kind: number,
  content: string
): { status: TaskStatus; statusDescription?: string } {
  const statusDescription = content.trim() || undefined;
  if (kind === NostrEventKind.GitStatusApplied) {
    return { status: "done", statusDescription };
  }
  if (kind === NostrEventKind.GitStatusClosed) {
    return { status: "closed", statusDescription };
  }
  if (kind === NostrEventKind.GitStatusOpen || kind === NostrEventKind.GitStatusDraft || kind === NostrEventKind.Procedure) {
    if (!statusDescription) return { status: "todo" };
    return { status: "in-progress", statusDescription };
  }
  return { status: "todo", statusDescription };
}
