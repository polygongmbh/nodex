import changelogRaw from "../../CHANGELOG.md?raw";

export interface ChangelogSection {
  title?: string;
  items: string[];
}

export interface ChangelogRelease {
  version: string;
  date?: string;
  summary?: string;
  sections: ChangelogSection[];
}

const RELEASE_HEADING_PATTERN = /^## \[(.+?)\](?: - (\d{4}-\d{2}-\d{2}))?$/;
const SECTION_HEADING_PATTERN = /^###\s+(.+)$/;
const BULLET_PATTERN = /^-\s+(.+)$/;

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  const lines = markdown.split(/\r?\n/);
  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ChangelogSection | null = null;

  const ensureSection = (): ChangelogSection => {
    if (currentSection) return currentSection;
    if (!currentRelease) {
      currentSection = { items: [] };
      return currentSection;
    }
    const section = { items: [] } as ChangelogSection;
    currentRelease.sections.push(section);
    currentSection = section;
    return section;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const releaseMatch = trimmed.match(RELEASE_HEADING_PATTERN);
    if (releaseMatch) {
      currentRelease = {
        version: releaseMatch[1],
        date: releaseMatch[2],
        sections: [],
      };
      releases.push(currentRelease);
      currentSection = null;
      continue;
    }

    if (!currentRelease) continue;
    if (trimmed.startsWith("## ")) break;

    const sectionMatch = trimmed.match(SECTION_HEADING_PATTERN);
    if (sectionMatch) {
      currentSection = {
        title: sectionMatch[1],
        items: [],
      };
      currentRelease.sections.push(currentSection);
      continue;
    }

    const bulletMatch = trimmed.match(BULLET_PATTERN);
    if (bulletMatch) {
      ensureSection().items.push(bulletMatch[1]);
      continue;
    }

    if (trimmed && !currentRelease.summary && !trimmed.startsWith("#")) {
      currentRelease.summary = trimmed;
    }
  }

  return releases.map((release) => ({
    ...release,
    sections: release.sections.filter((section) => section.items.length > 0),
  }));
}

export const APP_CHANGELOG = parseChangelog(changelogRaw);
