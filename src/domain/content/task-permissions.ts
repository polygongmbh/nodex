import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { extractMentionIdentifiersFromContent } from "@/lib/mentions";
import { resolveTaskEditMode } from "./task-permissions-policy";

export function extractAssignedMentionsFromContent(content: string): string[] {
  return extractMentionIdentifiersFromContent(content);
}

function getTaskAssignees(task: Task): string[] {
  const explicitAssigneePubkeys =
    task.assigneePubkeys
      ?.map((value) => value.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)) || [];
  if (explicitAssigneePubkeys.length > 0) return explicitAssigneePubkeys;

  const explicitMentions =
    task.mentions
      ?.map((value) => value.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)) || [];
  if (explicitMentions.length > 0) return explicitMentions;
  return extractAssignedMentionsFromContent(task.content);
}

function getTaskAssigneePubkeys(task: Task): string[] {
  const explicitAssigneePubkeys =
    task.assigneePubkeys
      ?.map((value) => value.trim().toLowerCase())
      .filter((value): value is string => Boolean(value)) || [];
  if (explicitAssigneePubkeys.length > 0) return explicitAssigneePubkeys;

  const explicitMentionPubkeys =
    task.mentions
      ?.map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/i.test(value)) || [];
  if (explicitMentionPubkeys.length > 0) return explicitMentionPubkeys;

  return extractAssignedMentionsFromContent(task.content).filter((value) => /^[a-f0-9]{64}$/i.test(value));
}

function normalizeIdentity(value: string | undefined): string {
  return value?.trim().toLowerCase() || "";
}

function findMatchingPerson(identifier: string, people: Person[]): Person | undefined {
  const needle = normalizeIdentity(identifier);
  if (!needle) return undefined;
  return people.find((person) => {
    const candidates = [person.id, person.name, person.displayName, person.nip05].map(normalizeIdentity);
    return candidates.some((candidate) => candidate === needle);
  });
}

function getNormalizedUserIdentifiers(user?: Person): Set<string> {
  return new Set(
    [user?.id, user?.name, user?.displayName, user?.nip05]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase())
  );
}

function isTaskOwnedByUser(task: Task, currentUser?: Person): boolean {
  const userIdentifiers = getNormalizedUserIdentifiers(currentUser);
  if (userIdentifiers.size === 0) return false;
  const ownerIdentifiers = [task.author.id, task.author.name, task.author.displayName, task.author.nip05]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  return ownerIdentifiers.some((value) => userIdentifiers.has(value));
}

function isTaskOwnedByPubkey(task: Task, pubkey?: string): boolean {
  const normalizedPubkey = normalizeIdentity(pubkey);
  if (!normalizedPubkey) return false;
  return normalizeIdentity(task.author.id) === normalizedPubkey;
}

function areAssignedTaskEditsOpenToEveryone(): boolean {
  return resolveTaskEditMode() === "everyone";
}

export function canUserUpdateTask(task: Task, currentUser?: Person): boolean {
  if (task.taskType !== "task") return false;
  if (!currentUser) return false;
  if (areAssignedTaskEditsOpenToEveryone()) return true;

  const assignees = getTaskAssignees(task);
  if (assignees.length === 0) return true;
  if (isTaskOwnedByUser(task, currentUser)) return true;

  const userIdentifiers = getNormalizedUserIdentifiers(currentUser);
  return assignees.some((assignee) => userIdentifiers.has(assignee));
}

export function canPubkeyUpdateTask(task: Task, updaterPubkey?: string): boolean {
  if (task.taskType !== "task") return false;
  const normalizedPubkey = normalizeIdentity(updaterPubkey);
  if (areAssignedTaskEditsOpenToEveryone()) return Boolean(normalizedPubkey);

  const assigneePubkeys = getTaskAssigneePubkeys(task);
  if (assigneePubkeys.length === 0) return Boolean(normalizedPubkey);

  if (isTaskOwnedByPubkey(task, updaterPubkey)) return true;
  if (!normalizedPubkey) return false;

  return assigneePubkeys.some((assignee) => assignee === normalizedPubkey);
}

export function canUserChangeTaskStatus(task: Task, currentUser?: Person): boolean {
  return canUserUpdateTask(task, currentUser);
}

function getPersonIdentityLabel(person: Person): string {
  const displayName = person.displayName?.trim();
  const username = person.name?.trim();
  const nip05 = person.nip05?.trim();
  const pubkey = person.id?.trim();

  const primary = displayName || username || nip05 || pubkey || "another user";
  const extras: string[] = [];

  if (username && username !== primary) extras.push(`@${username}`);
  if (nip05 && nip05 !== primary) extras.push(nip05);
  if (pubkey && pubkey !== primary) extras.push(pubkey);

  if (extras.length === 0) return primary;
  return `${primary} (${extras.join(", ")})`;
}

function getTaskOwnerLabel(task: Task, knownPeople: Person[]): string {
  const enriched = findMatchingPerson(task.author.id, knownPeople) || task.author;
  return getPersonIdentityLabel({
    ...task.author,
    ...enriched,
  });
}

function formatPrincipalLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "another user";
  if (/^[a-f0-9]{64}$/i.test(normalized)) return normalized;
  if (/^[a-z0-9._-]+$/i.test(normalized)) return `@${normalized}`;
  return normalized;
}

export function getTaskStatusChangeBlockedReason(
  task: Task,
  currentUser?: Person,
  isInteractionBlocked = false,
  knownPeople: Person[] = []
): string | undefined {
  if (isInteractionBlocked) {
    return "Editing is currently unavailable.";
  }
  if (task.taskType !== "task") {
    return "Only tasks can be edited.";
  }
  if (!currentUser) {
    return "Sign in to edit this task.";
  }
  if (canUserUpdateTask(task, currentUser)) {
    return undefined;
  }
  const assignees = getTaskAssignees(task);
  if (assignees.length > 0) {
    const assignee = assignees[0];
    const ownerIdentifiers = new Set(
      [task.author.id, task.author.name, task.author.displayName, task.author.nip05]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase())
    );
    const matchedPerson = findMatchingPerson(assignee, knownPeople);
    const assigneeLabel = ownerIdentifiers.has(assignee.toLowerCase())
      ? getTaskOwnerLabel(task, knownPeople)
      : matchedPerson
        ? getPersonIdentityLabel(matchedPerson)
        : formatPrincipalLabel(assignee);
    return `Editing is not possible because this task is assigned to ${assigneeLabel}. Only tagged assignees and the creator can update it.`;
  }
  return undefined;
}
