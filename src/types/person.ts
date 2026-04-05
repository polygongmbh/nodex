import { formatUserFacingPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

export interface Person {
  id: string;
  name: string;
  displayName: string;
  nip05?: string;
  about?: string;
  avatar?: string;
  isOnline: boolean;
  onlineStatus?: "online" | "recent" | "offline";
  lastPresenceAtMs?: number;
  presenceView?: string;
  presenceTaskId?: string | null;
  isSelected: boolean;
  /** Present when pinned; value is the display order (0 = first). */
  pinIndex?: number;
}

interface AuthorMetaLabelInput {
  personId: string;
  displayName: string;
  username?: string;
  nip05?: string;
}

interface AuthorMetaLabelParts {
  primary: string;
  secondary?: string;
}

type PersonLabelSource = Pick<Person, "id" | "displayName" | "name">;

function abbreviatePubkey(pubkey: string): string {
  return formatUserFacingPubkey(pubkey, { prefix: 6, suffix: 4, ellipsis: "…" });
}

export function isPubkeyDerivedPlaceholder(value: string, personId: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedPubkey = personId.trim().toLowerCase();
  const normalizedUserFacingPubkey = toUserFacingPubkey(normalizedPubkey).toLowerCase();
  const placeholders = new Set<string>();

  const addVariants = (identifier: string) => {
    if (!identifier) return;
    const prefix10 = identifier.slice(0, 10);
    const prefix8 = identifier.slice(0, 8);
    const prefix6 = identifier.slice(0, 6);
    const suffix8 = identifier.slice(-8);
    const suffix6 = identifier.slice(-6);
    const suffix4 = identifier.slice(-4);

    placeholders.add(identifier);
    placeholders.add(prefix10);
    placeholders.add(prefix8);
    placeholders.add(prefix6);
    placeholders.add(`${prefix10}...${suffix6}`);
    placeholders.add(`${prefix10}…${suffix6}`);
    placeholders.add(`${prefix8}...${suffix4}`);
    placeholders.add(`${prefix8}…${suffix4}`);
    placeholders.add(`${prefix6}...${suffix4}`);
    placeholders.add(`${prefix6}…${suffix4}`);
    placeholders.add(`${prefix8}...${suffix8}`);
    placeholders.add(`${prefix8}…${suffix8}`);
  };

  addVariants(normalizedPubkey);
  addVariants(normalizedUserFacingPubkey);

  return placeholders.has(normalizedValue);
}

export function getPersonDisplayName(person: PersonLabelSource): string {
  return person.displayName.trim() || person.name.trim() || person.id.trim();
}

export function getCompactPersonLabel(person: PersonLabelSource): string {
  const displayName = getPersonDisplayName(person);

  if (isPubkeyDerivedPlaceholder(displayName, person.id)) {
    return formatUserFacingPubkey(person.id, { prefix: 10, suffix: 6, ellipsis: "…" });
  }

  return displayName;
}

export function formatAuthorMetaLabel({
  personId,
  displayName,
  username,
  nip05,
}: AuthorMetaLabelInput): string {
  const parts = formatAuthorMetaParts({ personId, displayName, username, nip05 });
  if (!parts.secondary) return parts.primary;
  return `${parts.primary} (${parts.secondary})`;
}

export function formatAuthorMetaParts({
  personId,
  displayName,
  username,
  nip05,
}: AuthorMetaLabelInput): AuthorMetaLabelParts {
  const normalizedName = displayName.trim();
  const normalizedUsername = (username || "").trim();
  const normalizedNip05 = (nip05 || "").trim();
  const hasDisplayName = normalizedName.length > 0;
  const hasUsername = normalizedUsername.length > 0;
  const hasNip05 = normalizedNip05.length > 0;
  const hasHumanDisplayName =
    hasDisplayName && !isPubkeyDerivedPlaceholder(normalizedName, personId);
  const hasHumanUsername =
    hasUsername && !isPubkeyDerivedPlaceholder(normalizedUsername, personId);
  const hasDistinctUsername =
    hasHumanUsername &&
    (!hasHumanDisplayName || normalizedUsername.toLowerCase() !== normalizedName.toLowerCase());
  const hasDistinctNip05 =
    hasNip05 &&
    (!hasHumanDisplayName || normalizedNip05.toLowerCase() !== normalizedName.toLowerCase()) &&
    (!hasHumanUsername || normalizedNip05.toLowerCase() !== normalizedUsername.toLowerCase());

  if (!hasHumanDisplayName && !hasHumanUsername && !hasDistinctNip05) {
    return { primary: toUserFacingPubkey(personId) };
  }

  const abbreviatedPubkey = abbreviatePubkey(personId);
  const secondaryParts: string[] = [];

  if (hasDistinctUsername) {
    secondaryParts.push(`@${normalizedUsername}`);
  }

  if (hasDistinctNip05) {
    secondaryParts.push(normalizedNip05);
  }

  secondaryParts.push(abbreviatedPubkey);

  if (hasHumanDisplayName) {
    return {
      primary: normalizedName,
      secondary: secondaryParts.join(" · "),
    };
  }

  if (hasHumanUsername) {
    return {
      primary: `@${normalizedUsername}`,
      secondary: secondaryParts
        .filter((part) => part !== `@${normalizedUsername}`)
        .join(" · "),
    };
  }

  return {
    primary: normalizedNip05,
    secondary: abbreviatedPubkey,
  };
}
