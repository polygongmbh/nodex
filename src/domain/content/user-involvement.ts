import { getTaskAssigneePubkeys, type Post } from "@/types";

function normalizePubkey(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Ids of posts that "involve" the user: posts they authored, posts assigned to
 * them, and any activity beneath those (replies and subtasks anywhere in the
 * subtree of an involving post). Deliberately narrower than whole-thread
 * expansion — commenting once inside a foreign project does not pull that
 * project's unrelated activity in, but everything under the user's own posts
 * does count as activity directed at them.
 */
export function buildUserInvolvementIndex(
  posts: Post[],
  userPubkey: string | undefined
): Set<string> {
  const self = normalizePubkey(userPubkey);
  const involved = new Set<string>();
  if (!self) return involved;

  const postById = new Map(posts.map((post) => [post.id, post]));
  const concernsSelf = (post: Post): boolean => {
    if (normalizePubkey(post.author?.pubkey) === self) return true;
    return getTaskAssigneePubkeys(post).some((pubkey) => normalizePubkey(pubkey) === self);
  };

  const memo = new Map<string, boolean>();
  const isInvolved = (post: Post): boolean => {
    const chain: Post[] = [];
    const seen = new Set<string>();
    let current: Post | undefined = post;
    let result = false;
    while (current && !seen.has(current.id)) {
      const cached = memo.get(current.id);
      if (cached !== undefined) {
        result = cached;
        break;
      }
      seen.add(current.id);
      chain.push(current);
      if (concernsSelf(current)) {
        result = true;
        break;
      }
      current = current.parentId ? postById.get(current.parentId) : undefined;
    }
    for (const member of chain) memo.set(member.id, result);
    return result;
  };

  for (const post of posts) {
    if (isInvolved(post)) involved.add(post.id);
  }
  return involved;
}

interface HomeTimelinePredicateOptions {
  /** Focused task id; top-level then means "direct child of the focus". */
  focusedTaskId: string | null;
  /** Result of {@link buildUserInvolvementIndex}. */
  involvedIds: Set<string>;
}

/**
 * Default restriction of the home timeline: top-level activity everyone sees,
 * plus anything involving the current user. Callers lift this predicate
 * entirely (pass no predicate) once sidebar channel/person filters are active.
 */
export function makeHomeTimelinePredicate({
  focusedTaskId,
  involvedIds,
}: HomeTimelinePredicateOptions): (post: Post) => boolean {
  return (post: Post) => {
    const isTopLevelInContext = focusedTaskId
      ? post.parentId === focusedTaskId
      : !post.parentId;
    return isTopLevelInContext || involvedIds.has(post.id);
  };
}
