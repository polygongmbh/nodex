export interface EditableNostrProfile {
  name: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

export function hasRequiredProfileFields(profile?: Partial<EditableNostrProfile> | null): boolean {
  return Boolean(profile?.name?.trim());
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
