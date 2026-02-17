import type { Person, Task } from "@/types";
import { extractAssignedMentionsFromContent } from "@/lib/task-permissions";

function normalize(value?: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildSelectedPersonIdentifierSet(selectedPeople: Person[]): Set<string> {
  const identifiers = new Set<string>();
  for (const person of selectedPeople) {
    [person.id, person.name, person.displayName]
      .filter(Boolean)
      .map(normalize)
      .forEach((identifier) => identifiers.add(identifier));
  }
  return identifiers;
}

export function taskMatchesSelectedPeople(task: Task, selectedPeople: Person[]): boolean {
  if (selectedPeople.length === 0) return true;

  const selectedPersonIds = new Set(selectedPeople.map((person) => normalize(person.id)).filter(Boolean));
  if (selectedPersonIds.has(normalize(task.author?.id))) {
    return true;
  }

  const selectedIdentifiers = buildSelectedPersonIdentifierSet(selectedPeople);
  const assigneeIdentifiers =
    task.assigneePubkeys?.map((mention) => normalize(mention)).filter(Boolean) || [];
  const taskMentions = assigneeIdentifiers.length > 0
    ? assigneeIdentifiers
    : (
        task.mentions?.map((mention) => normalize(mention)).filter(Boolean) ||
        extractAssignedMentionsFromContent(task.content || "")
      );

  return taskMentions.some((mention) => selectedIdentifiers.has(mention));
}
