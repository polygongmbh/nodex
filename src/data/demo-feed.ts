import { dedupeMergedTasks } from "@/domain/content/task-collections";
import { nostrEventsToTasks } from "@/infrastructure/nostr/task-converter";
import { saveCachedKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import type { Post } from "@/types";
import { basicNostrEvents, DEMO_RELAY_URL } from "./basic-nostr-events";
import { mockKind0Events, mockTasks } from "./mockData";

let demoSeedTasksCache: Post[] | undefined;

export function getDemoFeedSeedTasks(): Post[] {
  return (demoSeedTasksCache ??= dedupeMergedTasks([
    ...mockTasks,
    ...nostrEventsToTasks(basicNostrEvents),
  ]));
}

export function initializeDemoFeedData(): Post[] {
  saveCachedKind0Events(mockKind0Events, DEMO_RELAY_URL);
  return getDemoFeedSeedTasks();
}
