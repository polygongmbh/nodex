import type { Person, Task } from "@/types";
import { extractAssignedMentionsFromContent } from "@/lib/task-permissions";

function normalize(value: string): string {
  return value.trim().toLowerCase();
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

  const selectedPersonIds = new Set(selectedPeople.map((person) => normalize(person.id)));
  if (selectedPersonIds.has(normalize(task.author.id))) {
    return true;
  }

  const selectedIdentifiers = buildSelectedPersonIdentifierSet(selectedPeople);
  const taskMentions =
    task.mentions?.map(normalize).filter(Boolean) || extractAssignedMentionsFromContent(task.content);

  return taskMentions.some((mention) => selectedIdentifiers.has(mention));
}

