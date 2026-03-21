import { useMemo } from "react";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";

export interface FeedViewInteractionModel {
  forceShowComposer: boolean;
}

export function useFeedViewInteractionModel(): FeedViewInteractionModel {
  const { forceShowComposer = false } = useFeedTaskViewModel();

  return useMemo(
    () => ({
      forceShowComposer,
    }),
    [forceShowComposer]
  );
}
