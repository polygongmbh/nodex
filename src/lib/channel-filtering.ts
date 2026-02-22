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

export function taskMatchesChannelFilters(
  taskTags: string[],
  includedChannels: string[],
  excludedChannels: string[],
  mode: ChannelMatchMode
): boolean {
  const taskTagSet = new Set(taskTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));

  if (excludedChannels.length > 0) {
    for (const excluded of excludedChannels) {
      if (taskTagSet.has(excluded)) {
        return false;
      }
    }
  }

  if (includedChannels.length === 0) {
    return true;
  }

  if (mode === "or") {
    return includedChannels.some((included) => taskTagSet.has(included));
  }

  return includedChannels.every((included) => taskTagSet.has(included));
}
