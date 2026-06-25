import type { Post } from "@/types";
import type { Person } from "@/types/person";
import type { LatestPresenceSnapshot } from "@/lib/presence-status";

const DEFAULT_MIN_POSTS = 3;

interface DeriveSidebarPeopleOptions {
  minPosts?: number;
  personalizeScores?: Map<string, number>;
}

interface PersonStats {
  count: number;
  latestTimestampMs: number;
}

export function deriveSidebarPeople(
  people: Person[],
  tasks: Post[],
  latestPresenceByAuthorId: Map<string, LatestPresenceSnapshot> = new Map(),
  now: Date = new Date(),
  options: DeriveSidebarPeopleOptions = {}
): Person[] {
  const minPosts = options.minPosts ?? DEFAULT_MIN_POSTS;
  const personalizeScores = options.personalizeScores ?? new Map();
  const statsByAuthorId = new Map<string, PersonStats>();

  for (const task of tasks) {
    const authorId = task.pubkey.trim().toLowerCase();
    if (!authorId) continue;

    const nextTimestampMs =
      task.timestamp instanceof Date ? task.timestamp.getTime() : Number.NEGATIVE_INFINITY;
    const previous = statsByAuthorId.get(authorId);

    if (!previous) {
      statsByAuthorId.set(authorId, {
        count: 1,
        latestTimestampMs: nextTimestampMs,
      });
      continue;
    }

    statsByAuthorId.set(authorId, {
      count: previous.count + 1,
      latestTimestampMs: Math.max(previous.latestTimestampMs, nextTimestampMs),
    });
  }

  return people
    .map((person) => {
      const normalizedId = person.pubkey.trim().toLowerCase();
      const stats = statsByAuthorId.get(normalizedId);
      if (!stats || stats.count < minPosts) {
        return null;
      }
      const personalScore = personalizeScores.get(normalizedId) || 0;

      // Presence influences sort order (an "active" snapshot keeps a person
      // near the top even if their last post is older), but it is no longer
      // attached to the returned record — the row component reads presence
      // live via usePersonPresence(pubkey).
      const latestPresence = latestPresenceByAuthorId.get(normalizedId);
      const latestPresenceTimestampMs =
        latestPresence?.state === "active" ? latestPresence.reportedAtMs : undefined;
      const latestActivityTimestampMs = Math.max(
        stats.latestTimestampMs ?? Number.NEGATIVE_INFINITY,
        latestPresenceTimestampMs ?? Number.NEGATIVE_INFINITY,
      );

      return {
        person,
        latestTimestampMs: latestActivityTimestampMs,
        personalScore,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => {
      if (b.latestTimestampMs !== a.latestTimestampMs) {
        return b.latestTimestampMs - a.latestTimestampMs;
      }
      if (b.personalScore !== a.personalScore) {
        return b.personalScore - a.personalScore;
      }
      return (a.person.displayName ?? "").localeCompare(b.person.displayName ?? "", undefined, {
        sensitivity: "base",
      });
    })
    .map((entry) => entry.person);
}
