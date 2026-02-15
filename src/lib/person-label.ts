interface AuthorMetaLabelInput {
  personId: string;
  displayName: string;
  username?: string;
}

interface AuthorMetaLabelParts {
  primary: string;
  secondary?: string;
}

function abbreviatePubkey(pubkey: string): string {
  if (pubkey.length <= 10) return pubkey;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

function isPubkeyDerivedPlaceholder(value: string, personId: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedPubkey = personId.trim().toLowerCase();
  const prefix8 = normalizedPubkey.slice(0, 8);
  const prefix6 = normalizedPubkey.slice(0, 6);
  const suffix4 = normalizedPubkey.slice(-4);
  const suffix8 = normalizedPubkey.slice(-8);

  const placeholders = new Set([
    normalizedPubkey,
    prefix8,
    prefix6,
    `${prefix8}...${suffix4}`,
    `${prefix8}…${suffix4}`,
    `${prefix6}...${suffix4}`,
    `${prefix6}…${suffix4}`,
    `${prefix8}...${suffix8}`,
    `${prefix8}…${suffix8}`,
  ]);

  return placeholders.has(normalizedValue);
}

export function formatAuthorMetaLabel({
  personId,
  displayName,
  username,
}: AuthorMetaLabelInput): string {
  const parts = formatAuthorMetaParts({ personId, displayName, username });
  if (!parts.secondary) return parts.primary;
  return `${parts.primary} (${parts.secondary})`;
}

export function formatAuthorMetaParts({
  personId,
  displayName,
  username,
}: AuthorMetaLabelInput): AuthorMetaLabelParts {
  const normalizedName = displayName.trim();
  const normalizedUsername = (username || "").trim();
  const hasDisplayName = normalizedName.length > 0;
  const hasUsername = normalizedUsername.length > 0;
  const hasHumanDisplayName =
    hasDisplayName && !isPubkeyDerivedPlaceholder(normalizedName, personId);
  const hasHumanUsername =
    hasUsername && !isPubkeyDerivedPlaceholder(normalizedUsername, personId);
  const hasDistinctUsername =
    hasHumanUsername &&
    (!hasHumanDisplayName || normalizedUsername.toLowerCase() !== normalizedName.toLowerCase());

  if (!hasHumanDisplayName && !hasHumanUsername) {
    return { primary: personId };
  }

  const abbreviatedPubkey = abbreviatePubkey(personId);

  if (hasDistinctUsername) {
    if (hasHumanDisplayName) {
      return {
        primary: normalizedName,
        secondary: `@${normalizedUsername} · ${abbreviatedPubkey}`,
      };
    }
    return {
      primary: `@${normalizedUsername}`,
      secondary: abbreviatedPubkey,
    };
  }

  if (hasHumanDisplayName) {
    return {
      primary: normalizedName,
      secondary: abbreviatedPubkey,
    };
  }

  return {
    primary: `@${normalizedUsername}`,
    secondary: abbreviatedPubkey,
  };
}
