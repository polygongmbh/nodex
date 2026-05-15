import type { Channel, ChannelMatchMode } from "@/types";

interface ChannelBuckets {
  included: string[];
  excluded: string[];
}

export function getIncludedExcludedChannelNames(channels: Channel[]): ChannelBuckets {
  const included: string[] = [];
  const excluded: string[] = [];

  for (const channel of channels) {
    const normalized = channel.name.trim().toLowerCase();
    if (!normalized) continue;

    if (channel.filterState === "included") {
      included.push(normalized);
    } else if (channel.filterState === "excluded") {
      excluded.push(normalized);
    }
  }

  return { included, excluded };
}

// Filter F matches tag T when one is a prefix of the other and they differ in
// length by at most 2 characters. Symmetric, language-agnostic, no stem table.
export function fuzzyChannelTagMatch(filter: string, tag: string): boolean {
  if (filter === tag) return true;
  if (tag.length > filter.length) {
    return tag.length - filter.length <= 2 && tag.startsWith(filter);
  }
  return filter.length - tag.length <= 2 && filter.startsWith(tag);
}

function anyTagFuzzyMatches(tags: string[], channel: string): boolean {
  for (const tag of tags) {
    if (fuzzyChannelTagMatch(channel, tag)) return true;
  }
  return false;
}

export function taskMatchesChannelFilters(
  taskTags: string[],
  includedChannels: string[],
  excludedChannels: string[],
  mode: ChannelMatchMode
): boolean {
  const normalizedTags = taskTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);

  for (const excluded of excludedChannels) {
    if (anyTagFuzzyMatches(normalizedTags, excluded)) return false;
  }

  if (includedChannels.length === 0) return true;

  if (mode === "or") {
    return includedChannels.some((included) => anyTagFuzzyMatches(normalizedTags, included));
  }

  return includedChannels.every((included) => anyTagFuzzyMatches(normalizedTags, included));
}
