import type { Task } from "@/types";
import { getTaskLatestModifiedMs } from "./taskSorting";

export function sortByLatestModified(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aTime = getTaskLatestModifiedMs(a);
    const bTime = getTaskLatestModifiedMs(b);
    return bTime - aTime;
  });
}
