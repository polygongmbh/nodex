import { useMemo } from "react";
import { FailedPublishQueueBanner } from "@/components/tasks/FailedPublishQueueBanner";
import { useFailedPublishDraftsStore } from "@/features/feed-page/stores/failed-publish-drafts-store";
import { useFeedRelayState } from "@/features/feed-page/views/FeedRelayProvider";
import { getRelayIdFromUrl } from "@/infrastructure/nostr/relay-identity";

interface FailedPublishQueueBannerContainerProps {
  isMobile?: boolean;
}

export function FailedPublishQueueBannerContainer({ isMobile }: FailedPublishQueueBannerContainerProps) {
  const drafts = useFailedPublishDraftsStore((s) => s.failedPublishDrafts);
  const { effectiveActiveRelayIds, relays } = useFeedRelayState();

  const visibleFeedDrafts = useMemo(
    () =>
      drafts.filter((draft) => {
        const targetRelayIds = draft.relayIds.length > 0
          ? draft.relayIds
          : draft.relayUrls.map((url) => getRelayIdFromUrl(url));
        if (targetRelayIds.length === 0) return true;
        return targetRelayIds.some((relayId) => effectiveActiveRelayIds.has(relayId));
      }),
    [drafts, effectiveActiveRelayIds]
  );

  const selectedRelayIds = useMemo(
    () => relays.filter((relay) => effectiveActiveRelayIds.has(relay.id)).map((relay) => relay.id),
    [effectiveActiveRelayIds, relays]
  );

  return (
    <FailedPublishQueueBanner
      drafts={drafts}
      selectedFeedDrafts={visibleFeedDrafts}
      selectedRelayIds={selectedRelayIds}
      isMobile={isMobile}
    />
  );
}
