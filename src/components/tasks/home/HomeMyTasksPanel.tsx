import { useTranslation } from "react-i18next";
import { StatusMyTasksTree } from "@/components/tasks/status/StatusMyTasksTree";
import type { Post } from "@/types";

interface HomeMyTasksPanelProps {
  /** Sidebar-scoped tasks, already narrowed to the selected day when one is set. */
  contextTasks: Post[];
  allTasks: Post[];
  peopleScope: Set<string>;
  focusedTaskId: string | null;
  /** True when a selected day leaves the people scope without any dated task. */
  showEmptyDayHint: boolean;
}

/**
 * The home view's my-tasks column: the status view's owned-tasks tree, plus a
 * visible hint when a selected calendar day has no matching tasks (the tree
 * itself renders nothing in that case).
 */
export function HomeMyTasksPanel({
  contextTasks,
  allTasks,
  peopleScope,
  focusedTaskId,
  showEmptyDayHint,
}: HomeMyTasksPanelProps) {
  const { t } = useTranslation("tasks");
  if (showEmptyDayHint) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {t("home.myTasks.emptyForDay")}
      </div>
    );
  }
  return (
    <StatusMyTasksTree
      contextTasks={contextTasks}
      allTasks={allTasks}
      peopleScope={peopleScope}
      focusedTaskId={focusedTaskId}
    />
  );
}
