import { Channel, Task } from "@/types";

interface NostrEventLike {
  tags: string[][];
  content: string;
}

interface DeriveChannelsOptions {
  minCount?: number;
  personalizeScores?: Map<string, number>;
  maxCount?: number;
}

function resolveDeriveOptions(minCountOrOptions: number | DeriveChannelsOptions = 6): Required<DeriveChannelsOptions> {
  if (typeof minCountOrOptions === "number") {
    return {
      minCount: minCountOrOptions,
      personalizeScores: new Map(),
      maxCount: Number.POSITIVE_INFINITY,
    };
  }
  return {
    minCount: minCountOrOptions.minCount ?? 6,
    personalizeScores: minCountOrOptions.personalizeScores ?? new Map(),
    maxCount: minCountOrOptions.maxCount ?? Number.POSITIVE_INFINITY,
  };
}

export function deriveChannels(
  localTasks: Pick<Task, "tags">[],
  nostrEvents: NostrEventLike[],
  userPostedTags: string[],
  minCountOrOptions: number | DeriveChannelsOptions = 6
): Channel[] {
  const options = resolveDeriveOptions(minCountOrOptions);
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
    .filter(([name, count]) =>
      count >= options.minCount ||
      forceInclude.has(name) ||
      (options.personalizeScores.get(name) || 0) > 0
    )
    .sort(([nameA, countA], [nameB, countB]) => {
      const personalA = options.personalizeScores.get(nameA) || 0;
      const personalB = options.personalizeScores.get(nameB) || 0;
      const baseA = Math.log1p(countA);
      const baseB = Math.log1p(countB);
      // Damp personalized boosts on globally high-volume channels to avoid over-dominance.
      const dampenedPersonalA = Math.log1p(personalA) / (1 + Math.sqrt(countA));
      const dampenedPersonalB = Math.log1p(personalB) / (1 + Math.sqrt(countB));
      const scoreA = baseA + dampenedPersonalA * 2;
      const scoreB = baseB + dampenedPersonalB * 2;
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (countA !== countB) return countB - countA;
      return nameA.localeCompare(nameB);
    })
    .slice(0, options.maxCount)
    .map(([name, count]) => ({
      id: name,
      name,
      usageCount: count,
      filterState: "neutral" as const,
    }));
}
