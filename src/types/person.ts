import { formatUserFacingPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

export interface Person {
  pubkey: string; // normalized lowercase 64-char hex
  name: string;
  displayName: string;
  nip05?: string;
  about?: string;
  avatar?: string;
}

export type SelectablePerson = Person & { isSelected: boolean };

export interface PersonPresenceSnapshot {
  state: "online" | "recent" | "offline";
  reportedAtMs?: number;
  context?: { view?: string; taskId?: string | null };
}

export interface SidebarPerson extends SelectablePerson {
  pinIndex?: number;
  presence?: PersonPresenceSnapshot;
}

type AuthorMetaLabelInput = Pick<Person, "pubkey" | "displayName" | "name" | "nip05">;

interface AuthorMetaLabelParts {
  primary: string;
  secondary?: string;
}

type PersonLabelSource = Pick<Person, "pubkey" | "displayName" | "name">;

function abbreviatePubkey(pubkey: string): string {
  return formatUserFacingPubkey(pubkey, { prefix: 6, suffix: 4, ellipsis: "…" });
}

export function isPubkeyDerivedPlaceholder(value: string, personPubkey: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedPubkey = personPubkey.trim().toLowerCase();
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
  return person.displayName.trim() || person.name.trim() || person.pubkey.trim();
}

export function getCompactPersonLabel(person: PersonLabelSource): string {
  const displayName = getPersonDisplayName(person);

  if (isPubkeyDerivedPlaceholder(displayName, person.pubkey)) {
    return formatUserFacingPubkey(person.pubkey, { prefix: 10, suffix: 6, ellipsis: "…" });
  }

  return displayName;
}

export function formatAuthorMetaLabel({
  pubkey,
  displayName,
  name,
  nip05,
}: AuthorMetaLabelInput): string {
  const parts = formatAuthorMetaParts({ pubkey, displayName, name, nip05 });
  if (!parts.secondary) return parts.primary;
  return `${parts.primary} (${parts.secondary})`;
}

export function formatAuthorMetaParts({
  pubkey,
  displayName,
  name,
  nip05,
}: AuthorMetaLabelInput): AuthorMetaLabelParts {
  const normalizedName = displayName.trim();
  const normalizedUsername = (name || "").trim();
  const normalizedNip05 = (nip05 || "").trim();
  const hasDisplayName = normalizedName.length > 0;
  const hasUsername = normalizedUsername.length > 0;
  const hasNip05 = normalizedNip05.length > 0;
  const hasHumanDisplayName =
    hasDisplayName && !isPubkeyDerivedPlaceholder(normalizedName, pubkey);
  const hasHumanUsername =
    hasUsername && !isPubkeyDerivedPlaceholder(normalizedUsername, pubkey);
  const hasDistinctUsername =
    hasHumanUsername &&
    (!hasHumanDisplayName || normalizedUsername.toLowerCase() !== normalizedName.toLowerCase());
  const hasDistinctNip05 =
    hasNip05 &&
    (!hasHumanDisplayName || normalizedNip05.toLowerCase() !== normalizedName.toLowerCase()) &&
    (!hasHumanUsername || normalizedNip05.toLowerCase() !== normalizedUsername.toLowerCase());

  if (!hasHumanDisplayName && !hasHumanUsername && !hasDistinctNip05) {
    return { primary: toUserFacingPubkey(pubkey) };
  }

  const abbreviatedPubkey = abbreviatePubkey(pubkey);
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
