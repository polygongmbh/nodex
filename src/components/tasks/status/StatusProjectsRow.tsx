import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusProjectCard } from "./StatusProjectCard";
import { selectStatusProjects } from "./status-filters";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { buildChildrenMap } from "@/domain/content/task-sorting";
import type { Task } from "@/types";

interface StatusProjectsRowProps {
  scopedTasks: Task[];
  allTasks: Task[];
  focusedTaskId: string | null;
}

export function StatusProjectsRow({ scopedTasks, allTasks, focusedTaskId }: StatusProjectsRowProps) {
  const { t } = useTranslation("tasks");
  const { people } = useFeedSurfaceState();
  const childrenByParentId = useMemo(() => buildChildrenMap(allTasks), [allTasks]);
  const projects = useMemo(
    () => selectStatusProjects({ scopedTasks, childrenByParentId, focusedTaskId }),
    [scopedTasks, childrenByParentId, focusedTaskId]
  );

  if (projects.length === 0) return null;

  return (
    <section
      aria-label={t("status.projects.label", { defaultValue: "Active projects" })}
      className="border-b border-border"
    >
      <div className="flex gap-3 overflow-x-auto px-3 py-3 scrollbar-main-view">
        {projects.map((project) => (
          <StatusProjectCard
            key={project.id}
            task={project}
            people={people}
            subtaskCount={(childrenByParentId.get(project.id) || []).filter((child) => child.taskType === "task").length}
          />
        ))}
      </div>
    </section>
  );
}
