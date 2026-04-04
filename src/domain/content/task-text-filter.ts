import type { Task } from "@/types";
import type { Person } from "@/types/person";
import {
  buildTaskSearchableText,
  searchableTextMatchesQuery,
} from "@/domain/content/task-search-document";

export function taskMatchesTextQuery(task: Task, query: string, people: Person[] = []): boolean {
  return searchableTextMatchesQuery(buildTaskSearchableText(task, people), query);
}
