import { useMemo } from "react";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { usePosts } from "@/features/feed-page/stores/posts-store";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { resolveRelayRoutingState, type RelayRoutingState } from "@/lib/nostr/task-relay-routing";
import { isWritableRelay } from "./task-composer-runtime";

export interface ComposerRelayState extends RelayRoutingState {
  shouldHideComposer: boolean;
  canCreateContent: boolean;
}

export function useComposerRelayBlock(focusedTaskId: string | null): ComposerRelayState {
  const { relays } = useFeedSurfaceState();
  const posts = usePosts();
  const authPolicy = useAuthActionPolicy();

  const parentTask = useMemo(
    () => (focusedTaskId ? posts.find((post) => post.id === focusedTaskId) : undefined),
    [posts, focusedTaskId]
  );

  const shouldHideComposer = useMemo(() => {
    if (!parentTask || parentTask.relays.length === 0) return false;
    const relaysById = new Map(relays.map((relay) => [relay.id, relay] as const));
    return parentTask.relays.every((relayId) => !isWritableRelay(relaysById.get(relayId)));
  }, [parentTask, relays]);

  const routingState = useMemo(
    () => resolveRelayRoutingState(relays, focusedTaskId),
    [relays, focusedTaskId]
  );

  return {
    shouldHideComposer,
    canCreateContent: authPolicy.canCreateContent,
    ...routingState,
  };
}
