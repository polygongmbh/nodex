import { NostrEventKind } from "@/lib/nostr/types";
import type { Person, TaskDateType, TaskStatus, TaskType } from "@/types";

export const FAILED_PUBLISH_DRAFTS_STORAGE_KEY = "nodex.failed-publish-drafts.v1";
const MAX_FAILED_PUBLISH_DRAFTS = 50;

export interface FailedPublishDraft {
  id: string;
  author: Person;
  content: string;
  tags: string[];
  relayIds: string[];
  relayUrls: string[];
  taskType: TaskType;
  createdAt: string;
  dateType?: TaskDateType;
  dueDate?: string;
  dueTime?: string;
  parentId?: string;
  initialStatus?: TaskStatus;
  mentionPubkeys: string[];
  assigneePubkeys?: string[];
  priority?: number;
  publishKind: NostrEventKind;
  publishTags: string[][];
  publishParentId?: string;
}

function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const person = value as Partial<Person>;
  return (
    typeof person.id === "string" &&
    typeof person.name === "string" &&
    typeof person.displayName === "string" &&
    typeof person.isOnline === "boolean" &&
    typeof person.isSelected === "boolean"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isTagArray(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every((entry) => isStringArray(entry));
}

function isTaskType(value: unknown): value is TaskType {
  return value === "task" || value === "comment";
}

function isTaskDateType(value: unknown): value is TaskDateType {
  return value === "due" || value === "scheduled" || value === "start" || value === "end" || value === "milestone";
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "in-progress" || value === "done";
}

function normalizeDraft(value: unknown): FailedPublishDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<FailedPublishDraft>;
  if (
    typeof draft.id !== "string" ||
    !isPerson(draft.author) ||
    typeof draft.content !== "string" ||
    !isStringArray(draft.tags) ||
    !isStringArray(draft.relayIds) ||
    !isStringArray(draft.relayUrls) ||
    !isTaskType(draft.taskType) ||
    typeof draft.createdAt !== "string" ||
    !isStringArray(draft.mentionPubkeys) ||
    typeof draft.publishKind !== "number" ||
    !isTagArray(draft.publishTags)
  ) {
    return null;
  }

  return {
    ...draft,
    id: draft.id,
    author: draft.author,
    content: draft.content,
    tags: draft.tags,
    relayIds: draft.relayIds,
    relayUrls: draft.relayUrls,
    taskType: draft.taskType,
    createdAt: draft.createdAt,
    mentionPubkeys: draft.mentionPubkeys,
    publishKind: draft.publishKind,
    publishTags: draft.publishTags,
    dueDate: typeof draft.dueDate === "string" ? draft.dueDate : undefined,
    dueTime: typeof draft.dueTime === "string" ? draft.dueTime : undefined,
    dateType: isTaskDateType(draft.dateType) ? draft.dateType : undefined,
    parentId: typeof draft.parentId === "string" ? draft.parentId : undefined,
    initialStatus: isTaskStatus(draft.initialStatus) ? draft.initialStatus : undefined,
    assigneePubkeys: isStringArray(draft.assigneePubkeys) ? draft.assigneePubkeys : undefined,
    priority: typeof draft.priority === "number" ? draft.priority : undefined,
    publishParentId: typeof draft.publishParentId === "string" ? draft.publishParentId : undefined,
  };
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadFailedPublishDrafts(): FailedPublishDraft[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(FAILED_PUBLISH_DRAFTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeDraft(entry))
      .filter((entry): entry is FailedPublishDraft => Boolean(entry))
      .slice(0, MAX_FAILED_PUBLISH_DRAFTS);
  } catch {
    return [];
  }
}

export function saveFailedPublishDrafts(drafts: FailedPublishDraft[]): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(
      FAILED_PUBLISH_DRAFTS_STORAGE_KEY,
      JSON.stringify(drafts.slice(0, MAX_FAILED_PUBLISH_DRAFTS))
    );
  } catch {
    // Ignore persistence errors and continue.
  }
}
