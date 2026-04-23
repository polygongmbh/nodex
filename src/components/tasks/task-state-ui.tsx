import { Circle, CircleDot, CheckCircle2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types";
import type { TaskStateType } from "@/domain/task-states/task-state-config";

const ICON_BY_STATUS: Record<string, LucideIcon> = {
  "circle": Circle,
  "circle-dot": CircleDot,
  "check-circle-2": CheckCircle2,
  "x": X,
};

const DEFAULT_ICON_FOR_TYPE: Record<TaskStateType, LucideIcon> = {
  open: Circle,
  active: CircleDot,
  done: CheckCircle2,
  closed: X,
};

/** Resolve a registry icon string to a Lucide component. */
export function getTaskStateIconComponent(iconId: string, fallbackType?: TaskStateType): LucideIcon {
  return ICON_BY_STATUS[iconId] ?? DEFAULT_ICON_FOR_TYPE[fallbackType ?? "open"] ?? Circle;
}

/** CSS color class for a task state type. */
const TONE_CLASS_BY_TYPE: Record<TaskStateType, string> = {
  open: "text-muted-foreground",
  active: "text-warning",
  done: "text-primary",
  closed: "text-muted-foreground",
};

export function getTaskStateToneClass(status: TaskStatus | undefined): string {
  return TONE_CLASS_BY_TYPE[status ?? "open"] ?? "text-muted-foreground";
}

/** Badge classes (pill styling) for a task state type. */
const BADGE_CLASS_BY_TYPE: Record<TaskStateType, string> = {
  open: "bg-muted text-muted-foreground",
  active: "bg-warning/15 text-warning",
  done: "bg-primary/10 text-primary",
  closed: "bg-muted/80 text-muted-foreground",
};

export function getTaskStateBadgeClasses(status: TaskStatus | undefined): string {
  return BADGE_CLASS_BY_TYPE[status ?? "open"] ?? BADGE_CLASS_BY_TYPE.open;
}

/** Render the icon for a task status at a given size. */
export function TaskStateIcon({
  status,
  className,
  size = "w-5 h-5",
}: {
  status: TaskStatus | undefined;
  className?: string;
  size?: string;
}) {
  const effectiveStatus = status ?? "open";
  const Icon = DEFAULT_ICON_FOR_TYPE[effectiveStatus] ?? Circle;
  const tone = TONE_CLASS_BY_TYPE[effectiveStatus];
  return <Icon className={cn(size, tone, className)} />;
}
