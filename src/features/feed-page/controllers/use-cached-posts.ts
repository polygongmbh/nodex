import { useCallback, useEffect, useRef, useState } from "react";
import type { Post } from "@/types";
import { loadCachedPosts, saveCachedPosts } from "@/features/feed-page/stores/posts-cache";

interface UseCachedPostsOptions {
  postsToPersist: Post[];
  /**
   * Only persist after the live subscription has finished its initial replay —
   * persisting mid-hydration would write an incomplete view that the next
   * cold-start would then render.
   */
  canPersist: boolean;
}

/**
 * Loads the cached Post snapshot once at mount (cold-start hydration) and
 * flushes the latest live Post list back to the cache on tab-hide / unmount.
 * No per-change writes — the cache is allowed to lag.
 */
export function useCachedPosts({
  postsToPersist,
  canPersist,
}: UseCachedPostsOptions): Post[] {
  const [cachedPosts] = useState<Post[]>(loadCachedPosts);

  const postsToPersistRef = useRef(postsToPersist);
  useEffect(() => {
    postsToPersistRef.current = postsToPersist;
  }, [postsToPersist]);

  const canPersistRef = useRef(canPersist);
  useEffect(() => {
    canPersistRef.current = canPersist;
  }, [canPersist]);

  const flush = useCallback(() => {
    if (!canPersistRef.current) return;
    saveCachedPosts(postsToPersistRef.current);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return cachedPosts;
}
