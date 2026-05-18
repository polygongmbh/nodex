import { useCallback, useEffect, useRef, useState } from "react";
import type { Post } from "@/types";
import {
  loadCachedPosts,
  saveCachedPosts,
} from "@/features/feed-page/stores/posts-cache";

const SAVE_DEBOUNCE_MS = 1500;

interface UseCachedPostsOptions {
  feedScopeKey: string;
  postsToPersist: Post[];
  /**
   * Only persist after the live subscription has finished its initial replay —
   * persisting mid-hydration would write an incomplete view that the next
   * cold-start would then render.
   */
  canPersist: boolean;
}

/**
 * Loads previously-cached Posts for the current scope on mount and persists
 * the live Post list back to localStorage on debounce / visibility hide.
 * Cached Posts are merged into the timeline by the caller so cold starts can
 * render immediately while live relay subscriptions catch up.
 */
export function useCachedPosts({
  feedScopeKey,
  postsToPersist,
  canPersist,
}: UseCachedPostsOptions): Post[] {
  const [cachedPosts, setCachedPosts] = useState<Post[]>(() => loadCachedPosts(feedScopeKey));

  useEffect(() => {
    setCachedPosts(loadCachedPosts(feedScopeKey));
  }, [feedScopeKey]);

  const postsToPersistRef = useRef(postsToPersist);
  useEffect(() => {
    postsToPersistRef.current = postsToPersist;
  }, [postsToPersist]);

  const flush = useCallback(() => {
    if (!canPersist) return;
    saveCachedPosts(feedScopeKey, postsToPersistRef.current);
  }, [canPersist, feedScopeKey]);

  useEffect(() => {
    if (!canPersist) return;
    if (typeof window === "undefined") {
      saveCachedPosts(feedScopeKey, postsToPersist);
      return;
    }
    const timer = window.setTimeout(() => {
      saveCachedPosts(feedScopeKey, postsToPersist);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [canPersist, feedScopeKey, postsToPersist]);

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
