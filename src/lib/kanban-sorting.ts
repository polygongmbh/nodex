import type { Task } from "@/types";

export function sortByLatestModified(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aTime = (a.lastEditedAt || a.timestamp).getTime();
    const bTime = (b.lastEditedAt || b.timestamp).getTime();
    return bTime - aTime;
  });
}
