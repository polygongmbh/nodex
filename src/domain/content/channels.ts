import { Channel, PostedTag, Post } from "@/types";

interface DeriveChannelsOptions {
  minCount?: number;
  personalizeScores?: Map<string, number>;
  maxCount?: number;
  sortVisibleAlphabetically?: boolean;
  coreChannels?: Set<string>;
  /** Pubkey of the current user; used to count user-authored posts per channel. */
  userPubkey?: string;
}

function resolveDeriveOptions(
  minCountOrOptions: number | DeriveChannelsOptions = 6
): Required<Omit<DeriveChannelsOptions, "userPubkey">> & { userPubkey?: string } {
  if (typeof minCountOrOptions === "number") {
    return {
      minCount: minCountOrOptions,
      personalizeScores: new Map(),
      maxCount: Number.POSITIVE_INFINITY,
      sortVisibleAlphabetically: false,
      coreChannels: new Set(),
    };
  }
  return {
    minCount: minCountOrOptions.minCount ?? 6,
    personalizeScores: minCountOrOptions.personalizeScores ?? new Map(),
    maxCount: minCountOrOptions.maxCount ?? Number.POSITIVE_INFINITY,
    sortVisibleAlphabetically: minCountOrOptions.sortVisibleAlphabetically ?? false,
    coreChannels: minCountOrOptions.coreChannels ?? new Set(),
    userPubkey: minCountOrOptions.userPubkey,
  };
}

type ChannelPost = Pick<Post, "tags"> & { author?: Pick<Post["author"], "pubkey"> };

export function deriveChannels(
  posts: ChannelPost[],
  userPostedTags: PostedTag[],
  minCountOrOptions: number | DeriveChannelsOptions = 6
): Channel[] {
  const options = resolveDeriveOptions(minCountOrOptions);
  const tagCounts = new Map<string, number>();
  const userPostCounts = new Map<string, number>();
  const normalizedUserPubkey = options.userPubkey?.trim().toLowerCase();

  posts.forEach((post) => {
    const authorPubkey = post.author?.pubkey?.trim().toLowerCase();
    const isUserAuthored =
      Boolean(normalizedUserPubkey) && authorPubkey === normalizedUserPubkey;
    // Posts can repeat tags; dedupe per-post so a single post can't double-count
    // a channel because the t-tag and the in-content hashtag both appear.
    const seen = new Set<string>();
    post.tags.forEach((tag) => {
      const lower = tag.toLowerCase();
      if (seen.has(lower)) return;
      seen.add(lower);
      tagCounts.set(lower, (tagCounts.get(lower) || 0) + 1);
      if (isUserAuthored) {
        userPostCounts.set(lower, (userPostCounts.get(lower) || 0) + 1);
      }
    });
  });

  const forceInclude = new Set<string>([
    ...userPostedTags.map((tag) => tag.name.toLowerCase()),
    ...Array.from(options.coreChannels).map((tag) => tag.toLowerCase()),
  ]);
  forceInclude.forEach((tag) => {
    if (!tagCounts.has(tag)) {
      tagCounts.set(tag, 0);
    }
  });

  const selected = Array.from(tagCounts.entries())
    .filter(
      ([name, count]) =>
        count >= options.minCount ||
        forceInclude.has(name) ||
        (options.personalizeScores.get(name) || 0) > 0
    )
    .sort(([nameA, countA], [nameB, countB]) => {
      const personalA = options.personalizeScores.get(nameA) || 0;
      const personalB = options.personalizeScores.get(nameB) || 0;
      const baseA = Math.log1p(countA);
      const baseB = Math.log1p(countB);
      const dampenedPersonalA = Math.log1p(personalA) / (1 + Math.sqrt(countA));
      const dampenedPersonalB = Math.log1p(personalB) / (1 + Math.sqrt(countB));
      const scoreA = baseA + dampenedPersonalA * 2;
      const scoreB = baseB + dampenedPersonalB * 2;
      if (scoreA !== scoreB) return scoreB - scoreA;
      if (countA !== countB) return countB - countA;
      return nameA.localeCompare(nameB);
    })
    .slice(0, options.maxCount);

  if (options.sortVisibleAlphabetically) {
    selected.sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
  }

  return selected.map(([name, count]) => {
    const personalScore = options.personalizeScores.get(name) ?? 0;
    const userPostCount = userPostCounts.get(name) ?? 0;
    return {
      id: name,
      name,
      usageCount: count,
      filterState: "neutral" as const,
      personalScore: personalScore > 0 ? personalScore : undefined,
      userPostCount: userPostCount > 0 ? userPostCount : undefined,
    };
  });
}
