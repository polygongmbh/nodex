import {
  Circle, CircleDot, CheckCircle2, X,
  PauseCircle, AlertCircle, Clock, Loader, Ban, Star,
  Zap, Archive, Eye, EyeOff, Flag, Minus, Plus, RotateCcw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskStatusType } from "@/types";
import {
  resolveTaskStateFromStatus,
  type TaskStateDefinition,
  type TaskStateType,
} from "@/domain/task-states/task-state-config";

const ICON_BY_STATUS: Record<string, LucideIcon> = {
  "circle": Circle,
  "circle-dot": CircleDot,
  "check-circle-2": CheckCircle2,
  "x": X,
  "pause-circle": PauseCircle,
  "alert-circle": AlertCircle,
  "clock": Clock,
  "loader": Loader,
  "ban": Ban,
  "star": Star,
  "zap": Zap,
  "archive": Archive,
  "eye": Eye,
  "eye-off": EyeOff,
  "flag": Flag,
  "minus": Minus,
  "plus": Plus,
  "rotate-ccw": RotateCcw,
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

export function getTaskStateToneClass(status: TaskStatusType): string {
  return TONE_CLASS_BY_TYPE[status] ?? "text-muted-foreground";
}

/** Badge classes (pill styling) for a task state type. */
const BADGE_CLASS_BY_TYPE: Record<TaskStateType, string> = {
  open: "bg-muted text-muted-foreground",
  active: "bg-warning/15 text-warning",
  done: "bg-primary/10 text-primary",
  closed: "bg-muted/80 text-muted-foreground",
};

export function getTaskStateBadgeClasses(status: TaskStatusType): string {
  return BADGE_CLASS_BY_TYPE[status] ?? BADGE_CLASS_BY_TYPE.open;
}

/**
 * Render the icon for either a full TaskStatus payload or a pre-resolved TaskStateDefinition.
 */
export function TaskStateIcon({
  status,
  className,
  size = "w-5 h-5",
}: {
  status?: TaskStatus;
  className?: string;
  size?: string;
}) {
  const resolvedState = resolveTaskStateFromStatus(status);
  const Icon = getTaskStateIconComponent(resolvedState.icon, resolvedState.type);
  const tone = getToneClassForDef(resolvedState);
  return <Icon className={cn(size, tone, className)} />;
}

/** Render the icon for a full TaskStateDefinition, respecting its configured icon and tone. */
export function TaskStateDefIcon({
  state,
  className,
  size = "w-4 h-4",
}: {
  state: TaskStateDefinition;
  className?: string;
  size?: string;
}) {
  const Icon = getTaskStateIconComponent(state.icon, state.type);
  const tone = getToneClassForDef(state);
  return <Icon className={cn(size, tone, className)} />;
}

/** CSS tone class for a full TaskStateDefinition, respecting its optional tone field. */
export function getToneClassForDef(state: TaskStateDefinition): string {
  if (state.tone) {
    const NAMED_TONES: Record<string, string> = {
      destructive: "text-destructive",
      warning: "text-warning",
      primary: "text-primary",
      muted: "text-muted-foreground",
      success: "text-green-500",
    };
    if (NAMED_TONES[state.tone]) return NAMED_TONES[state.tone];
    // Allow raw Tailwind class pass-through if not a named alias
    return state.tone;
  }
  return TONE_CLASS_BY_TYPE[state.type] ?? "text-muted-foreground";
}
