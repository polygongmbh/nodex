import { useEffect, useMemo } from "react";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { useCachedPosts } from "@/features/feed-page/controllers/use-cached-posts";
import {
  setPostsSuppression,
  usePosts,
} from "@/features/feed-page/stores/posts-store";
import { dedupeMergedTasks } from "@/domain/content/task-collections";
import type { Post } from "@/types";

const EMPTY_POSTS: Post[] = [];

interface UseAllPostsOptions {
  demoTasks: Post[];
  /**
   * True while the initial subscription backfill is still arriving. The merge
   * keeps cached posts in the visible set during this window so the UI doesn't
   * thrash on every chunk; once finalize fires we drop cached and switch to
   * the now-complete live nostrTasks in a single render.
   */
  isHydrating: boolean;
  hasLiveHydratedScope: boolean;
}

/**
 * The merged in-memory post set: local (unpublished) + demo + hydration-cached
 * + live nostr. Cached posts are only included while hydrating; after finalize
 * the live snapshot is complete and cached drops out in the same React commit.
 */
export function useAllPosts({
  demoTasks,
  isHydrating,
  hasLiveHydratedScope,
}: UseAllPostsOptions): Post[] {
  const localTasks = useTaskMutationStore((s) => s.localTasks);
  const suppressedNostrEventIds = useTaskMutationStore((s) => s.suppressedNostrEventIds);

  useEffect(() => {
    setPostsSuppression(suppressedNostrEventIds);
  }, [suppressedNostrEventIds]);

  const nostrTasks = usePosts();
  const cachedPosts = useCachedPosts({
    postsToPersist: nostrTasks,
    canPersist: hasLiveHydratedScope,
  });

  return useMemo(() => {
    const hydrationPosts = isHydrating ? cachedPosts : EMPTY_POSTS;
    return dedupeMergedTasks([
      ...localTasks,
      ...demoTasks,
      ...hydrationPosts,
      ...nostrTasks,
    ]);
  }, [cachedPosts, demoTasks, localTasks, nostrTasks, isHydrating]);
}
