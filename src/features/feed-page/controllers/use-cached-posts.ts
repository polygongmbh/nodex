import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Post } from "@/types";
import {
  loadCachedPostsForRelays,
  saveCachedPosts,
} from "@/features/feed-page/stores/posts-cache";

const SAVE_DEBOUNCE_MS = 1500;

interface UseCachedPostsOptions {
  activeRelayIds: Set<string>;
  postsToPersist: Post[];
  /**
   * Only persist after the live subscription has finished its initial replay —
   * persisting mid-hydration would write an incomplete view that the next
   * cold-start would then render.
   */
  canPersist: boolean;
}

/**
 * Loads previously-cached Posts from the per-relay buckets that match the
 * currently-active relay set, and fans the live Post list back out into
 * those buckets (debounced + on visibility hide). Cached Posts are merged
 * into the timeline by the caller so cold starts can render immediately
 * while live relay subscriptions catch up.
 */
export function useCachedPosts({
  activeRelayIds,
  postsToPersist,
  canPersist,
}: UseCachedPostsOptions): Post[] {
  const relayKey = useMemo(
    () => Array.from(activeRelayIds).filter(Boolean).sort().join(","),
    [activeRelayIds],
  );
  const activeRelayIdList = useMemo(
    () => Array.from(activeRelayIds).filter(Boolean),
    // `relayKey` already encodes the membership; recomputing on the set
    // reference would churn unrelated downstream effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [relayKey],
  );

  const [cachedPosts, setCachedPosts] = useState<Post[]>(
    () => loadCachedPostsForRelays(activeRelayIdList),
  );

  useEffect(() => {
    setCachedPosts(loadCachedPostsForRelays(activeRelayIdList));
  }, [activeRelayIdList]);

  const postsToPersistRef = useRef(postsToPersist);
  useEffect(() => {
    postsToPersistRef.current = postsToPersist;
  }, [postsToPersist]);

  const flush = useCallback(() => {
    if (!canPersist) return;
    saveCachedPosts(postsToPersistRef.current);
  }, [canPersist]);

  useEffect(() => {
    if (!canPersist) return;
    if (typeof window === "undefined") {
      saveCachedPosts(postsToPersist);
      return;
    }
    const timer = window.setTimeout(() => {
      saveCachedPosts(postsToPersist);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [canPersist, postsToPersist]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flush();
    };
  }, [flush]);

  return cachedPosts;
}
