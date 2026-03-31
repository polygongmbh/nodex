import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { shouldBootstrapGuideDemoFeed } from "@/lib/onboarding-guide";
import type { Task } from "@/types";

interface UseFeedDemoBootstrapOptions<Kind0Event> {
  totalTasks: number;
  demoFeedActive: boolean;
  demoRelayId: string;
  getDemoSeedTasks: () => Task[];
  demoKind0Events: Kind0Event[];
  setGuideDemoFeedEnabled: Dispatch<SetStateAction<boolean>>;
  setLocalTasks: Dispatch<SetStateAction<Task[]>>;
  seedCachedKind0Events: (events: Kind0Event[]) => void;
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  navigate: (to: string) => void;
}

export function useFeedDemoBootstrap<Kind0Event>({
  totalTasks,
  demoFeedActive,
  demoRelayId,
  getDemoSeedTasks,
  demoKind0Events,
  setGuideDemoFeedEnabled,
  setLocalTasks,
  seedCachedKind0Events,
  setActiveRelayIds,
  navigate,
}: UseFeedDemoBootstrapOptions<Kind0Event>) {
  const ensureGuideDataAvailable = useCallback(() => {
    if (!shouldBootstrapGuideDemoFeed({ totalTasks, demoFeedActive })) return;

    setGuideDemoFeedEnabled(true);
    setLocalTasks((previous) => (previous.length === 0 ? getDemoSeedTasks() : previous));
    seedCachedKind0Events(demoKind0Events);
    setActiveRelayIds((previous) => {
      const next = new Set(previous);
      next.add(demoRelayId);
      return next;
    });
    navigate("/feed");
  }, [
    demoFeedActive,
    demoKind0Events,
    demoRelayId,
    getDemoSeedTasks,
    navigate,
    seedCachedKind0Events,
    setActiveRelayIds,
    setGuideDemoFeedEnabled,
    setLocalTasks,
    totalTasks,
  ]);

  return { ensureGuideDataAvailable };
}
