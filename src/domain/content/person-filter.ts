import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { extractMentionIdentifiersFromContent } from "@/lib/mentions";

function normalize(value?: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildSelectedPersonIdentifierSet(selectedPeople: Person[]): Set<string> {
  const identifiers = new Set<string>();
  for (const person of selectedPeople) {
    [person.pubkey, person.name, person.displayName]
      .filter(Boolean)
      .map(normalize)
      .forEach((identifier) => identifiers.add(identifier));
  }
  return identifiers;
}

export function taskMatchesSelectedPeople(task: Task, selectedPeople: Person[]): boolean {
  if (selectedPeople.length === 0) return true;

  const selectedPersonIds = new Set(selectedPeople.map((person) => normalize(person.pubkey)).filter(Boolean));
  if (selectedPersonIds.has(normalize(task.author?.pubkey))) {
    return true;
  }

  for (const update of task.stateUpdates || []) {
    if (selectedPersonIds.has(normalize(update.authorPubkey))) return true;
  }

  const selectedIdentifiers = buildSelectedPersonIdentifierSet(selectedPeople);
  const taskMentions = new Set<string>();

  for (const assignee of task.assigneePubkeys || []) {
    const normalizedAssignee = normalize(assignee);
    if (normalizedAssignee) taskMentions.add(normalizedAssignee);
  }

  for (const mention of task.mentions || []) {
    const normalizedMention = normalize(mention);
    if (normalizedMention) taskMentions.add(normalizedMention);
  }

  for (const mention of extractMentionIdentifiersFromContent(task.content || "")) {
    const normalizedMention = normalize(mention);
    if (normalizedMention) taskMentions.add(normalizedMention);
  }

  return Array.from(taskMentions).some((mention) => selectedIdentifiers.has(mention));
}
