import type { Post } from "@/types";
import { getTaskLatestModifiedMs } from "@/domain/content/task-sorting";

export function sortByLatestModified<T extends Post>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aTime = getTaskLatestModifiedMs(a);
    const bTime = getTaskLatestModifiedMs(b);
    return bTime - aTime;
  });
}
