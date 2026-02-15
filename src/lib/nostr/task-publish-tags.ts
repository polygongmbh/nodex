export function buildTaskPublishTags(
  parentId?: string,
  parentRelayUrl?: string,
  mentionPubkeys: string[] = [],
): string[][] {
  const tags: string[][] = [];

  if (parentId) {
    tags.push(["e", parentId, parentRelayUrl || "", "parent"]);
  }

  const dedupedMentionPubkeys = Array.from(
    new Set(mentionPubkeys.map((pubkey) => pubkey.trim().toLowerCase()).filter(Boolean))
  );
  for (const mentionPubkey of dedupedMentionPubkeys) {
    tags.push(["p", mentionPubkey]);
  }

  return tags;
}
