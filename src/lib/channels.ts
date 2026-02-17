import { Channel, Task } from "@/types";

interface NostrEventLike {
  tags: string[][];
  content: string;
}

export function deriveChannels(
  localTasks: Pick<Task, "tags">[],
  nostrEvents: NostrEventLike[],
  userPostedTags: string[],
  minCount: number = 6
): Channel[] {
  const tagCounts = new Map<string, number>();

  localTasks.forEach((task) => {
    task.tags.forEach((tag) => {
      const lower = tag.toLowerCase();
      tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
    });
  });

  nostrEvents.forEach((event) => {
    event.tags
      .filter((tag) => tag[0]?.toLowerCase() === "t" && tag[1])
      .forEach((tag) => {
        const lower = tag[1].toLowerCase();
        tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
      });

    const hashtagRegex = /#(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = hashtagRegex.exec(event.content)) !== null) {
      const lower = match[1].toLowerCase();
      tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
    }
  });

  const forceInclude = new Set(userPostedTags.map((tag) => tag.toLowerCase()));
  forceInclude.forEach((tag) => {
    if (!tagCounts.has(tag)) {
      tagCounts.set(tag, 0);
    }
  });

  return Array.from(tagCounts.entries())
    .filter(([name, count]) => count >= minCount || forceInclude.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name]) => ({
      id: name,
      name,
      filterState: "neutral" as const,
    }));
}
