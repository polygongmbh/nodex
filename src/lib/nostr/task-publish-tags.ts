export function buildTaskPublishTags(
  parentId?: string,
  parentRelayUrl?: string,
  dueDate?: Date,
  dueTime?: string
): string[][] {
  const tags: string[][] = [];

  if (parentId) {
    tags.push(["e", parentId, parentRelayUrl || "", "parent"]);
  }

  if (dueDate) {
    tags.push(["due", String(Math.floor(dueDate.getTime() / 1000))]);
  }

  const normalizedDueTime = dueTime?.trim();
  if (normalizedDueTime) {
    tags.push(["due_time", normalizedDueTime]);
  }

  return tags;
}
