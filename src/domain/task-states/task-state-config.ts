import { normalizeTaskState, type TaskState, type TaskStatus } from "@/types";

export interface TaskStateDefinition {
  id: string;
  status: TaskStatus;
  label: string;
  icon: string;
  tone?: string;
  visibleByDefault: boolean;
}

export const DEFAULT_TASK_STATES: TaskStateDefinition[] = [
  { id: "open", status: "open", label: "Open", icon: "circle", visibleByDefault: true },
  { id: "active", status: "active", label: "In Progress", icon: "circle-dot", visibleByDefault: true },
  { id: "done", status: "done", label: "Done", icon: "circle-check-big", visibleByDefault: true },
  { id: "closed", status: "closed", label: "Closed", icon: "x", visibleByDefault: true },
];

function isValidStatus(value: unknown): value is TaskStatus {
  return value === "open" || value === "active" || value === "done" || value === "closed";
}

function isValidDefinition(entry: unknown): entry is TaskStateDefinition {
  if (typeof entry !== "object" || entry === null) return false;
  const obj = entry as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    obj.id.length > 0 &&
    isValidStatus(obj.status) &&
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
    ? (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_TASK_STATE_CONFIG
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

const DEFAULT_STATUS_DEFINITIONS: Record<TaskStatus, Omit<TaskStateDefinition, "id" | "visibleByDefault">> = {
  open: { status: "open", label: "Open", icon: "circle" },
  active: { status: "active", label: "Active", icon: "circle-dot" },
  done: { status: "done", label: "Done", icon: "circle-check-big" },
  closed: { status: "closed", label: "Closed", icon: "x" },
};

/**
 * Resolve a task's effective state definition from its status and optional label.
 * Matches configured states by label first, then falls back to the built-in for the status.
 */
export function resolveTaskState(
  status: TaskStatus | undefined,
  label?: string,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition {
  const effectiveStatus: TaskStatus = status ?? "open";
  if (label) {
    // Match a configured state whose label matches (case-insensitive) and whose status is compatible
    const byLabel = registry.find(
      (def) => def.status === effectiveStatus && def.label.toLowerCase() === label.toLowerCase()
    );
    if (byLabel) return byLabel;
    // Also match by id
    const byId = registry.find(
      (def) => def.id.toLowerCase() === label.toLowerCase()
    );
    if (byId) return byId;
    // Derive an ad-hoc definition for the unknown label
    const statusDefaults = DEFAULT_STATUS_DEFINITIONS[effectiveStatus];
    return { id: `${effectiveStatus}:${label.toLowerCase()}`, ...statusDefaults, label, visibleByDefault: false };
  }
  // No label — return the default state for this status
  const byStatus = registry.find((def) => def.status === effectiveStatus && def.id === effectiveStatus);
  if (byStatus) return byStatus;
  const firstOfStatus = registry.find((def) => def.status === effectiveStatus);
  if (firstOfStatus) return firstOfStatus;
  return { id: effectiveStatus, ...DEFAULT_STATUS_DEFINITIONS[effectiveStatus], visibleByDefault: false };
}

export function resolveTaskStateFromStatus(
  state: TaskState | TaskStatus | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition {
  const normalized = normalizeTaskState(state);
  return resolveTaskState(normalized.status, normalized.description, registry);
}

export function toTaskStateFromDefinition(state: TaskStateDefinition): TaskState {
  return state.id === state.status ? { status: state.status } : { status: state.status, description: state.label };
}

export function toTaskStateFromStateId(
  stateId: string,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskState {
  return toTaskStateFromDefinition(resolveTaskStateDefinition(stateId, registry));
}

export function resolveTaskStateDefinition(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition {
  if (!stateId) return registry[0] ?? DEFAULT_TASK_STATES[0];
  const found = registry.find((def) => def.id === stateId);
  if (found) return found;
  const fallbackStatus = deriveStatusFromUnknownStateId(stateId);
  const statusDefaults = DEFAULT_STATUS_DEFINITIONS[fallbackStatus];
  return { id: stateId, ...statusDefaults, label: stateId, visibleByDefault: false };
}

function deriveStatusFromUnknownStateId(stateId: string): TaskStatus {
  if (stateId === "done" || stateId === "completed") return "done";
  if (stateId === "closed") return "closed";
  if (stateId === "open" || stateId === "todo") return "open";
  return "active";
}

export function getTaskStatusForStateId(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStatus {
  return resolveTaskStateDefinition(stateId, registry).status;
}

export function isTaskCompletedState(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): boolean {
  return getTaskStatusForStateId(stateId, registry) === "done";
}

export function isTaskTerminalState(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): boolean {
  const status = getTaskStatusForStateId(stateId, registry);
  return status === "done" || status === "closed";
}

/**
 * Find the default (first) state definition of a given status within the registry.
 * Returns undefined if no state of that status is configured.
 */
export function getDefaultStateForStatus(
  status: TaskStatus,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition | undefined {
  return registry.find((def) => def.status === status);
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

export function getVisibleByDefaultStates(
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition[] {
  return registry.filter((def) => def.visibleByDefault);
}

/** Map a state to Nostr protocol status: active folds into open for publishing. */
export function getProtocolStatusForState(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): "open" | "done" | "closed" {
  const uiStatus = getTaskStatusForStateId(stateId, registry);
  if (uiStatus === "done") return "done";
  if (uiStatus === "closed") return "closed";
  return "open";
}
