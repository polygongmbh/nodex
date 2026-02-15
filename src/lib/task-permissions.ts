import type { Person, Task } from "@/types";

export function extractAssignedMentionsFromContent(content: string): string[] {
  const mentions =
    content.match(/@([a-zA-Z0-9_]+)/g)?.map((value) => value.slice(1).toLowerCase()) || [];
  return Array.from(new Set(mentions));
}

function getTaskAssignees(task: Task): string[] {
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
    [currentUser.id, currentUser.name, currentUser.displayName]
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  );

  return assignees.some((assignee) => userIdentifiers.has(assignee));
}
