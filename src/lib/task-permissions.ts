import type { Person, Task } from "@/types";
import { extractMentionIdentifiersFromContent } from "@/lib/mentions";

export function extractAssignedMentionsFromContent(content: string): string[] {
  return extractMentionIdentifiersFromContent(content);
}

function getTaskAssignees(task: Task): string[] {
  const explicitAssigneePubkeys =
    task.assigneePubkeys?.map((value) => value.trim().toLowerCase()).filter(Boolean) || [];
  if (explicitAssigneePubkeys.length > 0) return explicitAssigneePubkeys;

  const explicitMentions =
    task.mentions?.map((value) => value.trim().toLowerCase()).filter(Boolean) || [];
  if (explicitMentions.length > 0) return explicitMentions;
  return extractAssignedMentionsFromContent(task.content);
}

export function canUserChangeTaskStatus(task: Task, currentUser?: Person): boolean {
  if (task.taskType !== "task") return false;
  if (!currentUser) return false;

  const assignees = getTaskAssignees(task);
  if (assignees.length === 0) return true;

  const userIdentifiers = new Set(
    [currentUser.id, currentUser.name, currentUser.displayName, currentUser.nip05]
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  );

  return assignees.some((assignee) => userIdentifiers.has(assignee));
}
