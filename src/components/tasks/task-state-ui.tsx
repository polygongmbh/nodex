import dynamicIconImports from "lucide-react/dynamicIconImports";
import { Circle, CircleDot, CircleCheckBig, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskStatusType } from "@/types";
import {
  getTaskStateRegistry,
  resolveTaskStateFromStatus,
  type TaskStateDefinition,
  type TaskStateType,
} from "@/domain/task-states/task-state-config";

// Synchronous cache populated by preloadTaskStateIcons().
const iconCache = new Map<string, LucideIcon>();

const FALLBACK_ICONS: Record<TaskStateType, LucideIcon> = {
  open: Circle,
  active: CircleDot,
  done: CircleCheckBig,
  closed: X,
};

/**
 * Eagerly load Lucide icon components for every icon ID in the registry into the
 * synchronous cache.  Call once at startup; subsequent calls are no-ops for IDs
 * already cached.
 */
export async function preloadTaskStateIcons(
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): Promise<void> {
  const ids = [...new Set(registry.map((s) => s.icon))];
  await Promise.all(
    ids.map(async (id) => {
      if (iconCache.has(id)) return;
      const loader = dynamicIconImports[id as keyof typeof dynamicIconImports];
      if (!loader) return;
      const mod = await loader();
      iconCache.set(id, mod.default as LucideIcon);
    })
  );
}

// Kick off preloading when this module is first imported.
preloadTaskStateIcons();

/** Resolve a registry icon string to a Lucide component. */
export function getTaskStateIconComponent(iconId: string, fallbackType?: TaskStateType): LucideIcon {
  return iconCache.get(iconId) ?? FALLBACK_ICONS[fallbackType ?? "open"] ?? Circle;
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
