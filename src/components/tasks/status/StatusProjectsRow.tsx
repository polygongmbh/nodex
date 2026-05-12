import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusProjectCard } from "./StatusProjectCard";
import { hasInProgressTopLevelProject, selectStatusInProgressTopLevelTasks } from "./status-filters";
import { SharedViewComposer } from "@/components/tasks/SharedViewComposer";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { buildChildrenMap, sortTasks, type SortContext } from "@/domain/content/task-sorting";
import { evaluateTaskPriorities } from "@/domain/content/task-priority-evaluation";
import { isProjectFromChildrenMap } from "@/domain/content/task-projects";
import { isTaskKind } from "@/domain/content/task-kind";
import type { Task } from "@/types";

interface StatusProjectsRowProps {
  contextTasks: Task[];
  allTasks: Task[];
  focusedTaskId: string | null;
}

export function StatusProjectsRow({ contextTasks, allTasks, focusedTaskId }: StatusProjectsRowProps) {
  const { t } = useTranslation("tasks");
  const { people } = useFeedSurfaceState();
  const authPolicy = useAuthActionPolicy();
  const childrenByParentId = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const taskById = useMemo(() => new Map(allTasks.map((task) => [task.id, task] as const)), [allTasks]);
  const priorityScores = useMemo(() => evaluateTaskPriorities(allTasks), [allTasks]);
  const sortContext = useMemo<SortContext>(
    () => ({ childrenMap: childrenByParentId, allTasks, taskById, priorityScores }),
    [allTasks, childrenByParentId, priorityScores, taskById]
  );
  const inProgressTopLevel = useMemo(
    () => sortTasks(selectStatusInProgressTopLevelTasks({ contextTasks, focusedTaskId }), sortContext),
    [contextTasks, focusedTaskId, sortContext]
  );
  const hasProject = useMemo(
    () => hasInProgressTopLevelProject({ contextTasks, childrenByParentId, focusedTaskId }),
    [contextTasks, childrenByParentId, focusedTaskId]
  );

  if (!hasProject) {
    if (!authPolicy.canOpenCompose) return null;
    return <SharedViewComposer />;
  }

  if (inProgressTopLevel.length === 0) return null;

  return (
    <section
      aria-label={t("status.projects.label")}
      className="border-b border-border"
    >
      <div className="flex gap-3 overflow-x-auto px-3 py-3 scrollbar-main-view">
        {inProgressTopLevel.map((task) => (
          <StatusProjectCard
            key={task.id}
            task={task}
            people={people}
            isProject={isProjectFromChildrenMap(task.id, childrenByParentId)}
            subtaskCount={(childrenByParentId.get(task.id) || []).filter((child) => isTaskKind(child.kind)).length}
          />
        ))}
      </div>
    </section>
  );
}
