export function buildTaskPublishTags(
  parentId?: string,
  parentRelayUrl?: string,
): string[][] {
  const tags: string[][] = [];

  if (parentId) {
    tags.push(["e", parentId, parentRelayUrl || "", "parent"]);
  }

  return tags;
}
