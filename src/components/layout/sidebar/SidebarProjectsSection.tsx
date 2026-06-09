import { useMemo } from "react";
import { FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Post, TaskPost } from "@/types";
import { SidebarSection } from "./SidebarSection";
import { SidebarProjectItem } from "./SidebarProjectItem";
import { selectSidebarProjects, type SidebarProject } from "@/domain/content/sidebar-projects";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";
import { resolvePostsByIdFor } from "@/features/feed-page/stores/posts-store";
import { useFeedViewState } from "@/features/feed-page/views/feed-view-state-context";

interface SidebarProjectsSectionProps {
  posts: Post[];
  isExpanded: boolean;
  onToggle: () => void;
  focusedTaskId?: string | null;
}

/**
 * Sidebar section listing active top-level projects (active tasks with
 * non-terminal subtasks) and one indented level of active subprojects.
 * Hidden entirely while no project qualifies. In the home view — which has
 * no breadcrumb bar — the rows containing the focused post are highlighted
 * to indicate the current position.
 */
export function SidebarProjectsSection({
  posts,
  isExpanded,
  onToggle,
  focusedTaskId = null,
}: SidebarProjectsSectionProps) {
  const { t } = useTranslation("shell");
  const { currentView } = useFeedViewState();
  const childrenMap = useMemo(() => buildChildrenMap(posts), [posts]);
  const taskById = resolvePostsByIdFor(posts);
  const priorityScores = useMemo(() => evaluateTaskPriorities(posts), [posts]);
  const sortContext = useMemo<SortContext>(
    () => ({ childrenMap, allTasks: posts, taskById, priorityScores }),
    [posts, childrenMap, priorityScores, taskById]
  );

  const projects = useMemo<SidebarProject[]>(() => {
    const rows = selectSidebarProjects(posts);
    const rowByProjectId = new Map(rows.map((row) => [row.project.id, row]));
    const sortedProjects = sortTasks(rows.map((row) => row.project), sortContext) as TaskPost[];
    return sortedProjects.map((project) => {
      const row = rowByProjectId.get(project.id)!;
      return {
        project,
        subprojects: sortTasks(row.subprojects, sortContext) as TaskPost[],
      };
    });
  }, [posts, sortContext]);

  // Ancestor chain of the focused post (including itself), cycle-guarded —
  // marks which project rows contain the user's current position in home.
  const currentPositionIds = useMemo(() => {
    const ids = new Set<string>();
    if (currentView !== "home" || !focusedTaskId) return ids;
    ids.add(focusedTaskId);
    let current = taskById.get(focusedTaskId);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      ids.add(current.parentId);
      current = taskById.get(current.parentId);
    }
    return ids;
  }, [currentView, focusedTaskId, taskById]);

  if (projects.length === 0) return null;

  return (
    <SidebarSection
      dataOnboarding="projects-section"
      title={t("sidebar.sections.projects")}
      icon={FolderKanban}
      isExpanded={isExpanded}
      animationMode="fullCollapse"
      onToggle={onToggle}
    >
      {projects.map(({ project, subprojects }) => (
        <div key={project.id}>
          <SidebarProjectItem
            task={project}
            isCurrentPosition={currentPositionIds.has(project.id)}
          />
          {subprojects.map((subproject) => (
            <SidebarProjectItem
              key={subproject.id}
              task={subproject}
              isSubproject
              isCurrentPosition={currentPositionIds.has(subproject.id)}
            />
          ))}
        </div>
      ))}
    </SidebarSection>
  );
}
