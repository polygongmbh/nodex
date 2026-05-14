import { Channel } from "@/types";

export interface ChannelBands {
  /** Mobile selector's default visible set (subset of expanded). */
  primary: Channel[];
  /** Visibility set: noise filtered out. Renders in desktop expanded sidebar and mobile "Show more". */
  expanded: Channel[];
}

export interface ChannelBandThresholds {
  /** Min normalized score to enter the primary band (mobile default). */
  primaryPct?: number;
  /** Min normalized score to enter the expanded band (visibility floor). */
  expandedPct?: number;
  /** Backfill primary up to this size from expanded-only by score when natural primary is small. */
  primaryFloor?: number;
}

const DEFAULTS: Required<ChannelBandThresholds> = {
  primaryPct: 0.8,
  expandedPct: 0.5,
  primaryFloor: 3,
};

const INVOLVEMENT_BOOST = 0.5;

function rawScore(channel: Channel): number {
  const count = channel.usageCount ?? 0;
  const personal = channel.personalScore ?? 0;
  const involvement = channel.userPosted ? INVOLVEMENT_BOOST : 0;
  return Math.log1p(count) + 2 * Math.log1p(personal) + involvement;
}

function isForceIncluded(
  channel: Channel,
  isCore: (name: string) => boolean
): boolean {
  return (
    isCore(channel.name) ||
    channel.pinIndex !== undefined ||
    channel.filterState !== "neutral"
  );
}

export function bandChannelsByActivity(
  channels: Channel[],
  isCore: (name: string) => boolean,
  thresholds: ChannelBandThresholds = {}
): ChannelBands {
  if (channels.length === 0) {
    return { primary: [], expanded: [] };
  }

  const { primaryPct, expandedPct, primaryFloor } = { ...DEFAULTS, ...thresholds };

  const scored = channels.map((channel) => ({
    channel,
    score: rawScore(channel),
    forced: isForceIncluded(channel, isCore),
  }));

  const maxScore = scored.reduce((max, entry) => Math.max(max, entry.score), 0);

  const primaryIds = new Set<string>();
  const expandedIds = new Set<string>();

  scored.forEach((entry) => {
    const normalized = maxScore > 0 ? entry.score / maxScore : 0;
    if (entry.forced || normalized >= primaryPct) {
      primaryIds.add(entry.channel.id);
      expandedIds.add(entry.channel.id);
    } else if (normalized >= expandedPct) {
      expandedIds.add(entry.channel.id);
    }
  });

  if (primaryIds.size < primaryFloor) {
    const candidates = scored
      .filter((entry) => !primaryIds.has(entry.channel.id))
      .sort((a, b) => b.score - a.score);
    for (const candidate of candidates) {
      if (primaryIds.size >= primaryFloor) break;
      primaryIds.add(candidate.channel.id);
      expandedIds.add(candidate.channel.id);
    }
  }

  const primary = channels.filter((channel) => primaryIds.has(channel.id));
  const expanded = channels.filter((channel) => expandedIds.has(channel.id));

  return { primary, expanded };
}
