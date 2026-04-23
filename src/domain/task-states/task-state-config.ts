import { getTaskStatusType, normalizeTaskStatus, type TaskStatus, type TaskStatusLike, type TaskStatusType } from "@/types";

/** Semantic type for grouping, sorting, and protocol mapping — identical to TaskStatusType. */
export type TaskStateType = TaskStatusType;

export interface TaskStateDefinition {
  id: string;
  type: TaskStateType;
  label: string;
  icon: string;
  tone?: string;
  visibleByDefault: boolean;
}

export const DEFAULT_TASK_STATES: TaskStateDefinition[] = [
  { id: "open", type: "open", label: "Open", icon: "circle", visibleByDefault: true },
  { id: "active", type: "active", label: "In Progress", icon: "circle-dot", visibleByDefault: true },
  { id: "done", type: "done", label: "Done", icon: "circle-check-big", visibleByDefault: true },
  { id: "closed", type: "closed", label: "Closed", icon: "x", visibleByDefault: true },
];

function isValidStateType(value: unknown): value is TaskStateType {
  return value === "open" || value === "active" || value === "done" || value === "closed";
}

function isValidDefinition(entry: unknown): entry is TaskStateDefinition {
  if (typeof entry !== "object" || entry === null) return false;
  const obj = entry as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    obj.id.length > 0 &&
    isValidStateType(obj.type) &&
    typeof obj.label === "string" &&
    obj.label.length > 0 &&
    typeof obj.icon === "string" &&
    typeof obj.visibleByDefault === "boolean"
  );
}

export function parseTaskStateConfig(json: string): TaskStateDefinition[] | null {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const validated = parsed.filter(isValidDefinition);
    if (validated.length === 0) return null;
    const seen = new Set<string>();
    const deduped = validated.filter((def) => {
      if (seen.has(def.id)) return false;
      seen.add(def.id);
      return true;
    });
    return deduped;
  } catch {
    return null;
  }
}

let cachedRegistry: TaskStateDefinition[] | undefined;

export function getTaskStateRegistry(): TaskStateDefinition[] {
  if (cachedRegistry) return cachedRegistry;
  const envValue = typeof import.meta !== "undefined"
    ? (import.meta as Record<string, Record<string, string>>).env?.VITE_TASK_STATE_CONFIG
    : undefined;
  if (envValue) {
    const parsed = parseTaskStateConfig(envValue);
    if (parsed) {
      cachedRegistry = parsed;
      return parsed;
    }
    console.warn("[task-state-config] Invalid VITE_TASK_STATE_CONFIG, falling back to defaults");
  }
  cachedRegistry = DEFAULT_TASK_STATES;
  return DEFAULT_TASK_STATES;
}

/** Reset cached registry (for testing). */
export function resetTaskStateRegistry(): void {
  cachedRegistry = undefined;
}

const DEFAULT_TYPE_DEFINITIONS: Record<TaskStateType, Omit<TaskStateDefinition, "id" | "visibleByDefault">> = {
  open: { type: "open", label: "Open", icon: "circle" },
  active: { type: "active", label: "Active", icon: "circle-dot" },
  done: { type: "done", label: "Done", icon: "circle-check-big" },
  closed: { type: "closed", label: "Closed", icon: "x" },
};

/**
 * Resolve a task's effective state definition from its status and optional label.
 * Matches configured states by label first, then falls back to the built-in for the status.
 */
export function resolveTaskState(
  status: TaskStatusLike,
  label?: string,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition {
  const effectiveStatus: TaskStatusType = getTaskStatusType(status);
  if (label) {
    // Match a configured state whose label matches (case-insensitive) and whose type is compatible
    const byLabel = registry.find(
      (def) => def.type === effectiveStatus && def.label.toLowerCase() === label.toLowerCase()
    );
    if (byLabel) return byLabel;
    // Also match by id
    const byId = registry.find(
      (def) => def.id.toLowerCase() === label.toLowerCase()
    );
    if (byId) return byId;
    // Derive an ad-hoc definition for the unknown label
    const typeDefaults = DEFAULT_TYPE_DEFINITIONS[effectiveStatus];
    return { id: `${effectiveStatus}:${label.toLowerCase()}`, ...typeDefaults, label, visibleByDefault: false };
  }
  // No label — return the default state for this status type
  const byType = registry.find((def) => def.type === effectiveStatus && def.id === effectiveStatus);
  if (byType) return byType;
  const firstOfType = registry.find((def) => def.type === effectiveStatus);
  if (firstOfType) return firstOfType;
  return { id: effectiveStatus, ...DEFAULT_TYPE_DEFINITIONS[effectiveStatus], visibleByDefault: false };
}

export function resolveTaskStateFromStatus(
  status: TaskStatus | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition {
  const normalizedStatus = normalizeTaskStatus(status);
  return resolveTaskState(normalizedStatus.type, normalizedStatus.description, registry);
}

export function toTaskStatusFromStateDefinition(state: TaskStateDefinition): TaskStatus {
  return state.id === state.type ? { type: state.type } : { type: state.type, description: state.label };
}

export function toTaskStatusFromStateId(
  stateId: string,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStatus {
  return toTaskStatusFromStateDefinition(resolveTaskStateDefinition(stateId, registry));
}

export function resolveTaskStateDefinition(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition {
  if (!stateId) return registry[0] ?? DEFAULT_TASK_STATES[0];
  const found = registry.find((def) => def.id === stateId);
  if (found) return found;
  const fallbackType = deriveTypeFromUnknownStateId(stateId);
  const typeDefaults = DEFAULT_TYPE_DEFINITIONS[fallbackType];
  return { id: stateId, ...typeDefaults, label: stateId, visibleByDefault: false };
}

function deriveTypeFromUnknownStateId(stateId: string): TaskStateType {
  if (stateId === "done" || stateId === "completed") return "done";
  if (stateId === "closed") return "closed";
  if (stateId === "open" || stateId === "todo") return "open";
  return "active";
}

export function getTaskStateUiType(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateType {
  return resolveTaskStateDefinition(stateId, registry).type;
}

export function isTaskCompletedState(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): boolean {
  return getTaskStateUiType(stateId, registry) === "done";
}

export function isTaskTerminalState(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): boolean {
  const type = getTaskStateUiType(stateId, registry);
  return type === "done" || type === "closed";
}

function getDefaultStateForType(
  type: TaskStateType,
  registry: TaskStateDefinition[]
): TaskStateDefinition | undefined {
  return registry.find((def) => def.type === type);
}

/**
 * Returns the next state for a quick-toggle action, or null if the chooser should open.
 * Desktop: open -> default active, active -> default done, done/closed -> null (open chooser)
 * Mobile: open -> default done, active -> default done, done/closed -> null (open chooser)
 */
export function getQuickToggleNextState(
  stateId: string | TaskStatusLike,
  options: { mobile?: boolean } = {},
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): string | null {
  const currentType = typeof stateId === "string"
    ? getTaskStateUiType(stateId, registry)
    : getTaskStatusType(stateId);
  if (currentType === "done" || currentType === "closed") return null;

  if (currentType === "open" && !options.mobile) {
    return getDefaultStateForType("active", registry)?.id ?? null;
  }
  return getDefaultStateForType("done", registry)?.id ?? null;
}

/**
 * Cycle through all states in registry order, wrapping around.
 */
export function getNextStateInSequence(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): string {
  const currentId = stateId ?? registry[0]?.id ?? "open";
  const index = registry.findIndex((def) => def.id === currentId);
  if (index < 0) return registry[0]?.id ?? "open";
  return registry[(index + 1) % registry.length].id;
}

export function getStateSortType(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateType {
  return getTaskStateUiType(stateId, registry);
}

export function getVisibleByDefaultStates(
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition[] {
  return registry.filter((def) => def.visibleByDefault);
}

/** Map a state to Nostr protocol type: active folds into open for publishing. */
export function getProtocolTypeForState(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): "open" | "done" | "closed" {
  const uiType = getTaskStateUiType(stateId, registry);
  if (uiType === "done") return "done";
  if (uiType === "closed") return "closed";
  return "open";
}
