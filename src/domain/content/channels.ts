import { Channel, PostedTag, Post } from "@/types";

interface DeriveChannelsOptions {
  personalizeScores?: Map<string, number>;
  coreChannels?: Set<string>;
  /** Pubkey of the current user; used to count user-authored posts per channel. */
  userPubkey?: string;
}

type ChannelPost = Pick<Post, "tags"> & { author?: Pick<Post["author"], "pubkey"> };

export function deriveChannels(
  posts: ChannelPost[],
  userPostedTags: PostedTag[],
  options: DeriveChannelsOptions = {}
): Channel[] {
  const personalizeScores = options.personalizeScores ?? new Map<string, number>();
  const coreChannels = options.coreChannels ?? new Set<string>();
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
    ...Array.from(coreChannels).map((tag) => tag.toLowerCase()),
  ]);
  forceInclude.forEach((tag) => {
    if (!tagCounts.has(tag)) {
      tagCounts.set(tag, 0);
    }
  });

  return Array.from(tagCounts.entries()).map(([name, count]) => {
    const personalScore = personalizeScores.get(name) ?? 0;
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
