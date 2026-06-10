import { buildChildrenMap } from "@/domain/content/task-sorting";
import { isProjectFromChildrenMap } from "@/domain/content/task-projects";
import { getTaskState, getTaskStatus, isTaskPost, type Post, type TaskPost } from "@/types";

export interface SidebarProject {
  project: TaskPost;
  /** Active children that themselves have an active subtask (one nesting level). */
  subprojects: TaskPost[];
}

function isActiveTask(post: Post): post is TaskPost {
  return isTaskPost(post) && getTaskStatus(getTaskState(post)) === "active";
}

function hasActiveSubtask(taskId: string, childrenMap: Map<string | undefined, Post[]>): boolean {
  return (childrenMap.get(taskId) || []).some(isActiveTask);
}

/**
 * Projects shown in the sidebar: top-level tasks that are active and have at
 * least one non-terminal subtask, each with one level of subprojects (active
 * children that themselves have an active subtask). Callers sort the rows.
 */
export function selectSidebarProjects(posts: Post[]): SidebarProject[] {
  const childrenMap = buildChildrenMap(posts);
  const result: SidebarProject[] = [];
  for (const post of posts) {
    if (post.parentId) continue;
    if (!isActiveTask(post) || !isProjectFromChildrenMap(post.id, childrenMap)) continue;
    const subprojects = (childrenMap.get(post.id) || []).filter(
      (child): child is TaskPost => isActiveTask(child) && hasActiveSubtask(child.id, childrenMap)
    );
    result.push({ project: post, subprojects });
  }
  return result;
}

/**
 * Ancestor chain of the focused post, topmost ancestor first, ending at the
 * focused post itself — the same path a breadcrumb would show, regardless of
 * post type. Cycle-guarded against malformed parent links. Empty when nothing
 * is focused or the focused post is unknown.
 */
export function buildFocusChain(posts: Post[], focusedId: string | null | undefined): Post[] {
  if (!focusedId) return [];
  const byId = new Map(posts.map((post) => [post.id, post]));
  const chain: Post[] = [];
  const visited = new Set<string>();
  let current = byId.get(focusedId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}
