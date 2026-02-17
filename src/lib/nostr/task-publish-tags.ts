export function buildTaskPublishTags(
  parentId?: string,
  parentRelayUrl?: string,
  mentionPubkeys: string[] = [],
  priority?: number,
  channelNames: string[] = [],
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

  if (typeof priority === "number" && Number.isFinite(priority)) {
    tags.push(["priority", String(Math.max(0, Math.min(100, Math.round(priority))))]);
  }

  const dedupedChannelNames = Array.from(
    new Set(channelNames.map((name) => name.trim().toLowerCase()).filter(Boolean))
  );
  for (const channelName of dedupedChannelNames) {
    tags.push(["t", channelName]);
  }

  return tags;
}
