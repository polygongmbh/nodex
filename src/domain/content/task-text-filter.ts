import type { Task } from "@/types";
import type { Person } from "@/types/person";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function taskMatchesTextQuery(task: Task, query: string, people: Person[] = []): boolean {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  const tags = task.tags ?? [];
  const mentions = task.mentions ?? [];
  const assignees = task.assigneePubkeys ?? [];

  const authorId = task.author?.id?.trim().toLowerCase();
  const resolvedAuthor =
    people.find((person) => person.id.trim().toLowerCase() === authorId) ?? task.author;

  const haystack = [
    task.content,
    ...tags,
    ...tags.map((tag) => `#${tag}`),
    ...mentions,
    ...mentions.map((mention) => `@${mention}`),
    ...assignees,
    ...assignees.map((assignee) => `@${assignee}`),
    resolvedAuthor?.name ?? "",
    resolvedAuthor?.displayName ?? "",
    resolvedAuthor?.nip05 ?? "",
    resolvedAuthor?.id ?? "",
  ]
    .filter(Boolean)
    .map(normalize)
    .join("\n");

  return haystack.includes(normalizedQuery);
}
