import type { Task } from "@/types";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { HydrationStatusRow } from "@/components/tasks/HydrationStatusRow";

interface TaskViewStatusRowProps {
  allTasks: Task[];
  focusedTaskId: string | null;
  isHydrating?: boolean;
  className?: string;
  visible?: boolean;
}

export function TaskViewStatusRow({
  allTasks,
  focusedTaskId,
  isHydrating = false,
  className,
  visible = true,
}: TaskViewStatusRowProps) {
  if (!visible) return null;

  if (isHydrating) {
    return <HydrationStatusRow className={className} />;
  }

  if (!focusedTaskId) return null;

  return (
    <FocusedTaskBreadcrumb
      allTasks={allTasks}
      focusedTaskId={focusedTaskId}
      className={className}
    />
  );
}
