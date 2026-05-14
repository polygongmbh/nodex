import { mergeTasks } from "@/domain/content/task-merge";
import { nostrEventsToTasks } from "@/infrastructure/nostr/task-converter";
import { saveCachedKind0Events } from "@/infrastructure/nostr/people-from-kind0";
import type { Post } from "@/types";
import { basicNostrEvents } from "./basic-nostr-events";
import { mockKind0Events, mockTasks } from "./mockData";

let demoSeedTasksCache: Post[] | undefined;

export function getDemoFeedSeedTasks(): Post[] {
  return (demoSeedTasksCache ??= mergeTasks(
    mockTasks,
    nostrEventsToTasks(basicNostrEvents)
  ));
}

export function initializeDemoFeedData(): Post[] {
  saveCachedKind0Events(mockKind0Events);
  return getDemoFeedSeedTasks();
}
