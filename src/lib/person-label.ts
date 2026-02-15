interface AuthorMetaLabelInput {
  personId: string;
  displayName: string;
  username?: string;
}

function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36).slice(0, 4);
}

function shortenPubkey(pubkey: string): string {
  if (pubkey.length <= 8) return pubkey;
  return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`;
}

export function formatAuthorMetaLabel({
  personId,
  displayName,
  username,
}: AuthorMetaLabelInput): string {
  const normalizedName = displayName.trim();
  const normalizedUsername = (username || "").trim();
  const hasDistinctUsername =
    normalizedUsername.length > 0 &&
    normalizedUsername.toLowerCase() !== normalizedName.toLowerCase();
  const pubkeyToken = `${shortenPubkey(personId)}#${shortHash(personId)}`;

  if (hasDistinctUsername) {
    return `${normalizedName} (@${normalizedUsername} · ${pubkeyToken})`;
  }

  return `${normalizedName} (${pubkeyToken})`;
}
