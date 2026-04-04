import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { getMentionAliases, normalizeMentionIdentifier } from "@/lib/mentions";

export function normalizeTaskSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function resolvePeopleLookup(people: Person[] | Map<string, Person>): Map<string, Person> {
  if (people instanceof Map) {
    return people;
  }

  return new Map(
    people.map((person) => [normalizeTaskSearchValue(person.id), person] as const)
  );
}

function collectResolvedMentionPeople(
  identifiers: string[],
  peopleById: Map<string, Person>
): Person[] {
  if (identifiers.length === 0 || peopleById.size === 0) return [];

  const resolved = new Map<string, Person>();
  const people = Array.from(peopleById.values());

  for (const identifier of identifiers) {
    const normalizedIdentifier = normalizeMentionIdentifier(identifier);
    if (!normalizedIdentifier) continue;

    const directMatch = peopleById.get(normalizedIdentifier);
    if (directMatch) {
      resolved.set(directMatch.id, directMatch);
      continue;
    }

    for (const person of people) {
      if (getMentionAliases(person).includes(normalizedIdentifier)) {
        resolved.set(person.id, person);
        break;
      }
    }
  }

  return Array.from(resolved.values());
}

export function buildTaskSearchableText(
  task: Task,
  people: Person[] | Map<string, Person> = []
): string {
  const peopleById = resolvePeopleLookup(people);
  const tags = (task.tags ?? []).map(normalizeTaskSearchValue).filter(Boolean);
  const mentions = task.mentions ?? [];
  const assignees = task.assigneePubkeys ?? [];
  const resolvedMentionPeople = collectResolvedMentionPeople(mentions, peopleById);
  const resolvedAssigneePeople = collectResolvedMentionPeople(assignees, peopleById);
  const authorId = task.author?.id ? normalizeTaskSearchValue(task.author.id) : "";
  const resolvedAuthor =
    (authorId ? peopleById.get(authorId) : undefined) ?? task.author;

  return [
    task.content,
    ...tags,
    ...tags.map((tag) => `#${tag}`),
    ...mentions,
    ...mentions.map((mention) => `@${mention}`),
    ...assignees,
    ...assignees.map((assignee) => `@${assignee}`),
    ...resolvedMentionPeople.flatMap((person) => [
      person.name ?? "",
      person.displayName ?? "",
      person.nip05 ?? "",
      person.id ?? "",
    ]),
    ...resolvedAssigneePeople.flatMap((person) => [
      person.name ?? "",
      person.displayName ?? "",
      person.nip05 ?? "",
      person.id ?? "",
    ]),
    resolvedAuthor?.name ?? "",
    resolvedAuthor?.displayName ?? "",
    resolvedAuthor?.nip05 ?? "",
    resolvedAuthor?.id ?? "",
  ]
    .filter(Boolean)
    .map(normalizeTaskSearchValue)
    .join("\n");
}

export function searchableTextMatchesQuery(searchableText: string, query: string): boolean {
  const normalizedQuery = normalizeTaskSearchValue(query);
  if (!normalizedQuery) return true;
  return searchableText.includes(normalizedQuery);
}
