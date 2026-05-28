import type { Post } from "@/types";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import { HydrationStatusRow } from "@/components/tasks/HydrationStatusRow";

interface TaskViewStatusRowProps {
  posts: Post[];
  focusedTaskId: string | null;
  isHydrating?: boolean;
  className?: string;
  visible?: boolean;
}

export function TaskViewStatusRow({
  posts,
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
      posts={posts}
      focusedTaskId={focusedTaskId}
      className={className}
    />
  );
}
