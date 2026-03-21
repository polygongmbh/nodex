import { useCallback, useMemo } from "react";
import type { Person } from "@/types";
import { useFeedTaskViewModel } from "@/features/feed-page/views/feed-task-view-model-context";
import { useFeedInteractionDispatch } from "./feed-interaction-context";

export interface FeedViewInteractionModel {
  forceShowComposer: boolean;
  onFocusSidebar: () => void;
  onHashtagClick: (tag: string) => void;
  onAuthorClick: (author: Person) => void;
}

export function useFeedViewInteractionModel(): FeedViewInteractionModel {
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { forceShowComposer = false } = useFeedTaskViewModel();

  const onFocusSidebar = useCallback(() => {
    void dispatchFeedInteraction({ type: "ui.focusSidebar" });
  }, [dispatchFeedInteraction]);
  const onHashtagClick = useCallback((tag: string) => {
    void dispatchFeedInteraction({ type: "filter.applyHashtagExclusive", tag });
  }, [dispatchFeedInteraction]);
  const onAuthorClick = useCallback((author: Person) => {
    void dispatchFeedInteraction({ type: "filter.applyAuthorExclusive", author });
  }, [dispatchFeedInteraction]);

  return useMemo(
    () => ({
      forceShowComposer,
      onFocusSidebar,
      onHashtagClick,
      onAuthorClick,
    }),
    [
      forceShowComposer,
      onFocusSidebar,
      onHashtagClick,
      onAuthorClick,
    ]
  );
}
