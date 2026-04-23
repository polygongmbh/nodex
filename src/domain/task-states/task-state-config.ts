/** Semantic type for grouping, sorting, and protocol mapping. */
export type TaskStateType = "todo" | "active" | "done" | "closed";

export interface TaskStateDefinition {
  id: string;
  type: TaskStateType;
  label: string;
  icon: string;
  tone?: string;
  visibleByDefault: boolean;
}

export const DEFAULT_TASK_STATES: TaskStateDefinition[] = [
  { id: "todo", type: "todo", label: "To Do", icon: "circle", visibleByDefault: true },
  { id: "in-progress", type: "active", label: "In Progress", icon: "circle-dot", visibleByDefault: true },
  { id: "done", type: "done", label: "Done", icon: "check-circle-2", visibleByDefault: true },
  { id: "closed", type: "closed", label: "Closed", icon: "x", visibleByDefault: true },
];

function isValidStateType(value: unknown): value is TaskStateType {
  return value === "todo" || value === "active" || value === "done" || value === "closed";
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
    // Ensure unique ids
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
  todo: { type: "todo", label: "To Do", icon: "circle" },
  active: { type: "active", label: "Active", icon: "circle-dot" },
  done: { type: "done", label: "Done", icon: "check-circle-2" },
  closed: { type: "closed", label: "Closed", icon: "x" },
};

export function resolveTaskStateDefinition(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition {
  if (!stateId) return registry[0] ?? DEFAULT_TASK_STATES[0];
  const found = registry.find((def) => def.id === stateId);
  if (found) return found;
  // Derive a fallback definition from protocol type defaults
  const fallbackType = deriveTypeFromUnknownStateId(stateId);
  const typeDefaults = DEFAULT_TYPE_DEFINITIONS[fallbackType];
  return { id: stateId, ...typeDefaults, label: stateId, visibleByDefault: false };
}

function deriveTypeFromUnknownStateId(stateId: string): TaskStateType {
  // Known protocol-level mappings
  if (stateId === "done" || stateId === "completed") return "done";
  if (stateId === "closed") return "closed";
  if (stateId === "todo" || stateId === "open") return "todo";
  // Anything else is treated as active (in-progress variant)
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
 * Desktop: todo -> default active, active -> default done, done/closed -> null (open chooser)
 * Mobile: todo -> default done, active -> default done, done/closed -> null (open chooser)
 */
export function getQuickToggleNextState(
  stateId: string | undefined,
  options: { mobile?: boolean } = {},
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): string | null {
  const currentType = getTaskStateUiType(stateId, registry);
  if (currentType === "done" || currentType === "closed") return null;

  if (currentType === "todo" && !options.mobile) {
    return getDefaultStateForType("active", registry)?.id ?? null;
  }
  // todo (mobile) or active -> done
  return getDefaultStateForType("done", registry)?.id ?? null;
}

/**
 * Cycle through all states in registry order, wrapping around.
 * Used for keyboard-driven state stepping.
 */
export function getNextStateInSequence(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): string {
  const currentId = stateId ?? registry[0]?.id ?? "todo";
  const index = registry.findIndex((def) => def.id === currentId);
  if (index < 0) return registry[0]?.id ?? "todo";
  return registry[(index + 1) % registry.length].id;
}

/**
 * Returns the semantic sort type for a state, used to determine sort behavior.
 * Terminal states (done/closed) use latest-modified ordering; others use priority sorting.
 */
export function getStateSortType(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateType {
  return getTaskStateUiType(stateId, registry);
}

/** All states marked visible by default. */
export function getVisibleByDefaultStates(
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): TaskStateDefinition[] {
  return registry.filter((def) => def.visibleByDefault);
}

/** Map a UI state type to the Nostr protocol type for publishing. */
export function getProtocolTypeForState(
  stateId: string | undefined,
  registry: TaskStateDefinition[] = getTaskStateRegistry()
): "open" | "done" | "closed" {
  const uiType = getTaskStateUiType(stateId, registry);
  if (uiType === "done") return "done";
  if (uiType === "closed") return "closed";
  return "open";
}
