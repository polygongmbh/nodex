import { useCallback, useMemo } from "react";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import type { ResolvedTaskComposerEnvironment } from "./task-composer-runtime";

export interface ComposerFilterSync {
  filterTagNames: string[];
  filterMentionPubkeys: string[];
  onRemoveFilterTag: (name: string) => void;
  onRemoveFilterMention: (pubkey: string) => void;
}

export function useComposerFilterSync(
  environment: ResolvedTaskComposerEnvironment
): ComposerFilterSync {
  const dispatch = useFeedInteractionDispatch();

  const channelIdByName = useMemo(
    () => new Map(environment.channels.map((c) => [c.name.trim().toLowerCase(), c.id] as const)),
    [environment.channels]
  );

  const selectedPersonIdByPubkey = useMemo(
    () =>
      new Map(
        environment.people
          .filter((p) => p.isSelected)
          .map((p) => [p.pubkey, p.pubkey] as const)
      ),
    [environment.people]
  );

  const onRemoveFilterTag = useCallback(
    (name: string) => {
      const channelId = channelIdByName.get(name.trim().toLowerCase());
      if (channelId) void dispatch({ type: "filter.clearChannel", channelId });
    },
    [channelIdByName, dispatch]
  );

  const onRemoveFilterMention = useCallback(
    (pubkey: string) => {
      const personId = selectedPersonIdByPubkey.get(pubkey);
      if (personId) void dispatch({ type: "filter.clearPerson", personId });
    },
    [selectedPersonIdByPubkey, dispatch]
  );

  return {
    filterTagNames: environment.includedChannels,
    filterMentionPubkeys: environment.selectedPeoplePubkeys,
    onRemoveFilterTag,
    onRemoveFilterMention,
  };
}
