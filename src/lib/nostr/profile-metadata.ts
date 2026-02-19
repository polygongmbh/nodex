export interface EditableNostrProfile {
  name: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

export interface Kind0EventCandidate {
  createdAt: number;
  content: string;
}

const NIP05_NAME_PATTERN = /^[a-z0-9._-]+$/;

export function hasRequiredProfileFields(profile?: Partial<EditableNostrProfile> | null): boolean {
  return Boolean(profile?.name?.trim());
}

export function isNip05CompatibleName(name?: string | null): boolean {
  const normalized = name?.trim() || "";
  return normalized.length > 0 && NIP05_NAME_PATTERN.test(normalized);
}

export function buildKind0Content(profile: EditableNostrProfile): string {
  const name = profile.name.trim();
  if (!name) {
    throw new Error("name is required");
  }

  const metadata: Record<string, string> = { name };
  if (profile.displayName?.trim()) metadata.displayName = profile.displayName.trim();
  if (profile.about?.trim()) metadata.about = profile.about.trim();
  if (profile.picture?.trim()) metadata.picture = profile.picture.trim();
  if (profile.nip05?.trim()) metadata.nip05 = profile.nip05.trim();

  return JSON.stringify(metadata);
}

export function parseKind0Content(content: string): Partial<EditableNostrProfile> {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : undefined,
      about: typeof parsed.about === "string" ? parsed.about : undefined,
      picture: typeof parsed.picture === "string" ? parsed.picture : undefined,
      nip05: typeof parsed.nip05 === "string" ? parsed.nip05 : undefined,
    };
  } catch {
    return {};
  }
}

export function mergeKind0Profiles(events: Kind0EventCandidate[]): Partial<EditableNostrProfile> {
  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt);
  const merged: Partial<EditableNostrProfile> = {};

  for (const event of sorted) {
    const parsed = parseKind0Content(event.content);
    if (!merged.name && parsed.name?.trim()) merged.name = parsed.name.trim();
    if (!merged.displayName && parsed.displayName?.trim()) merged.displayName = parsed.displayName.trim();
    if (!merged.about && parsed.about?.trim()) merged.about = parsed.about.trim();
    if (!merged.picture && parsed.picture?.trim()) merged.picture = parsed.picture.trim();
    if (!merged.nip05 && parsed.nip05?.trim()) merged.nip05 = parsed.nip05.trim();
  }

  return merged;
}
