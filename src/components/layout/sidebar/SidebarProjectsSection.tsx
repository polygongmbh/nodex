import { Fragment, useMemo } from "react";
import { FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Post, TaskPost } from "@/types";
import { SidebarSection } from "./SidebarSection";
import { SidebarProjectItem } from "./SidebarProjectItem";
import {
  buildFocusChain,
  selectSidebarProjects,
  type SidebarProject,
} from "@/domain/content/sidebar-projects";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";
import { resolvePostsByIdFor } from "@/features/feed-page/stores/posts-store";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface SidebarProjectsSectionProps {
  posts: Post[];
  isExpanded: boolean;
  onToggle: () => void;
  focusedTaskId?: string | null;
}

/**
 * Sidebar section listing active top-level projects (active tasks with
 * non-terminal subtasks) and one indented level of active subprojects.
 * Hidden entirely while no project qualifies. In every view the rows
 * containing the focused post are highlighted, and the chain down to the
 * focused post is shown as temporary indented entries so the current
 * position in the tree stays visible. Clicking the section's folder icon
 * clears the focus back to the root.
 */
export function SidebarProjectsSection({
  posts,
  isExpanded,
  onToggle,
  focusedTaskId = null,
}: SidebarProjectsSectionProps) {
  const { t } = useTranslation("shell");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
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

  // Ancestor chain of the focused post (topmost first, focused post last) —
  // highlights the rows containing the current position and supplies the
  // temporary entries that extend a project down to the focused post.
  const focusChain = useMemo(() => buildFocusChain(posts, focusedTaskId), [posts, focusedTaskId]);
  const currentPositionIds = useMemo(
    () => new Set(focusChain.map((task) => task.id)),
    [focusChain]
  );

  if (projects.length === 0) return null;

  return (
    <SidebarSection
      dataOnboarding="projects-section"
      title={t("sidebar.sections.projects")}
      icon={FolderKanban}
      iconLabel={t("sidebar.projects.backToRoot")}
      onIconClick={() => {
        void dispatchFeedInteraction({ type: "task.focus.change", taskId: null });
      }}
      isExpanded={isExpanded}
      animationMode="fullCollapse"
      onToggle={onToggle}
    >
      {projects.map(({ project, subprojects }) => {
        const chainBelowProject = focusChain[0]?.id === project.id ? focusChain.slice(1) : [];
        const chainContinuesInSubproject = subprojects.some(
          (subproject) => subproject.id === chainBelowProject[0]?.id
        );
        return (
          <div key={project.id}>
            <SidebarProjectItem
              task={project}
              isCurrentPosition={currentPositionIds.has(project.id)}
            />
            {subprojects.map((subproject) => (
              <Fragment key={subproject.id}>
                <SidebarProjectItem
                  task={subproject}
                  depth={1}
                  isCurrentPosition={currentPositionIds.has(subproject.id)}
                />
                {chainBelowProject[0]?.id === subproject.id &&
                  chainBelowProject.slice(1).map((task, index) => (
                    <SidebarProjectItem
                      key={task.id}
                      task={task}
                      depth={2 + index}
                      isTemporary
                      isCurrentPosition
                    />
                  ))}
              </Fragment>
            ))}
            {!chainContinuesInSubproject &&
              chainBelowProject.map((task, index) => (
                <SidebarProjectItem
                  key={task.id}
                  task={task}
                  depth={1 + index}
                  isTemporary
                  isCurrentPosition
                />
              ))}
          </div>
        );
      })}
    </SidebarSection>
  );
}
