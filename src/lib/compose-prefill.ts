import type { Channel } from "@/types";

export function buildComposePrefillFromFiltersAndContext(
  channels: Channel[],
  contextTags: string[] = []
): string {
  const prefillChannels = new Set<string>();

  channels
    .filter((channel) => channel.filterState === "included")
    .forEach((channel) => prefillChannels.add(channel.name));

  contextTags.forEach((tag) => prefillChannels.add(tag));

  if (prefillChannels.size === 0) return "";
  return Array.from(prefillChannels)
    .map((channel) => `#${channel}`)
    .join(" ") + " ";
}
