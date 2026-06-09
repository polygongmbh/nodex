import { buildChildrenMap } from "@/domain/content/task-sorting";
import { isProjectFromChildrenMap } from "@/domain/content/task-projects";
import { getTaskState, getTaskStatus, isTaskPost, type Post, type TaskPost } from "@/types";

export interface SidebarProject {
  project: TaskPost;
  /** Active children that are themselves projects (one nesting level). */
  subprojects: TaskPost[];
}

function isActiveProject(post: Post, childrenMap: Map<string | undefined, Post[]>): post is TaskPost {
  return (
    isTaskPost(post) &&
    getTaskStatus(getTaskState(post)) === "active" &&
    isProjectFromChildrenMap(post.id, childrenMap)
  );
}

/**
 * Projects shown in the sidebar: top-level tasks that are active and have at
 * least one non-terminal subtask, each with one level of subprojects (active
 * children that again have non-terminal subtasks). Callers sort the rows.
 */
export function selectSidebarProjects(posts: Post[]): SidebarProject[] {
  const childrenMap = buildChildrenMap(posts);
  const result: SidebarProject[] = [];
  for (const post of posts) {
    if (post.parentId) continue;
    if (!isActiveProject(post, childrenMap)) continue;
    const subprojects = (childrenMap.get(post.id) || []).filter(
      (child): child is TaskPost => isActiveProject(child, childrenMap)
    );
    result.push({ project: post, subprojects });
  }
  return result;
}
