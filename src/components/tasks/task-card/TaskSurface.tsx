import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TaskSurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  taskId?: string;
  children: ReactNode;
}

export function TaskSurface({
  taskId,
  className,
  children,
  ...props
}: TaskSurfaceProps) {
  return (
    <div data-task-id={taskId} className={cn(className)} {...props}>
      {children}
    </div>
  );
}
