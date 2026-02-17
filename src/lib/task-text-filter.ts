import type { Task } from "@/types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function taskMatchesTextQuery(task: Task, query: string): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  const tags = task.tags ?? [];
  const mentions = task.mentions ?? [];
  const assignees = task.assigneePubkeys ?? [];

  const haystack = [
    task.content,
    ...tags,
    ...tags.map((tag) => `#${tag}`),
    ...mentions,
    ...mentions.map((mention) => `@${mention}`),
    ...assignees,
    ...assignees.map((assignee) => `@${assignee}`),
    task.author?.name ?? "",
    task.author?.displayName ?? "",
    task.author?.nip05 ?? "",
    task.author?.id ?? "",
  ]
    .filter(Boolean)
    .map(normalize)
    .join("\n");

  return haystack.includes(normalizedQuery);
}
