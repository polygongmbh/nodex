import { getTaskStatusType, type Task } from "@/types";
import { isProjectFromChildrenMap } from "@/domain/content/task-projects";

function normalizePubkey(value: string | undefined | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildPubkeySet(pubkeys: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const pubkey of pubkeys) {
    const normalized = normalizePubkey(pubkey);
    if (normalized) set.add(normalized);
  }
  return set;
}

function getNormalizedAssignees(task: Task): string[] {
  return (task.assigneePubkeys ?? []).map(normalizePubkey).filter(Boolean);
}

/**
 * "Owned" by a person = explicitly assigned, OR authored without any assignees.
 * Mirrors the implicit-ownership rule used to pick the avatar shown on a task.
 */
export function isTaskOwnedByAny(task: Task, pubkeys: Set<string>): boolean {
  if (pubkeys.size === 0) return false;
  const assignees = getNormalizedAssignees(task);
  if (assignees.length > 0) {
    return assignees.some((pubkey) => pubkeys.has(pubkey));
  }
  return pubkeys.has(normalizePubkey(task.author?.pubkey));
}

/**
 * Resolve the set of pubkeys that the status view's people-scoped sections
 * should focus on. Selected sidebar people take precedence; otherwise fall
 * back to the current user when signed in.
 */
export function resolveStatusPeopleScope(
  selectedPeoplePubkeys: string[],
  currentUserPubkey: string | undefined
): Set<string> {
  const normalizedSelected = buildPubkeySet(selectedPeoplePubkeys);
  if (normalizedSelected.size > 0) return normalizedSelected;
  const normalizedSelf = normalizePubkey(currentUserPubkey);
  return normalizedSelf ? new Set([normalizedSelf]) : new Set();
}

interface TopLevelTaskFilterOptions {
  /** Tasks already pre-scoped by sidebar (relay/channel/people/quick filters). */
  contextTasks: Task[];
  /** Focused task id (a.k.a. context root); null when scope is unfocused. */
  focusedTaskId: string | null;
}

/**
 * In-progress top-level tasks for the status row: task-typed entries with
 * `active` status that sit at the root of the current context (no parent when
 * unfocused, or direct children of the focused task otherwise).
 */
export function selectStatusInProgressTopLevelTasks({
  contextTasks,
  focusedTaskId,
}: TopLevelTaskFilterOptions): Task[] {
  const result: Task[] = [];
  for (const task of contextTasks) {
    if (task.taskType !== "task") continue;
    if (getTaskStatusType(task.status) !== "active") continue;
    const isTopLevelInContext = focusedTaskId
      ? task.parentId === focusedTaskId
      : !task.parentId;
    if (!isTopLevelInContext) continue;
    result.push(task);
  }
  return result;
}

interface ProjectFilterOptions extends TopLevelTaskFilterOptions {
  /** Map of parentId → children, built once across allTasks for subtask checks. */
  childrenByParentId: Map<string | undefined, Task[]>;
}

/**
 * Whether any in-progress top-level task within the context is also a
 * "project" (has at least one non-terminal task-typed subtask). Used to gate
 * the status row: with no project we hide the row entirely (and let the
 * composer fallback take over), even if there are active leaf tasks.
 */
export function hasInProgressTopLevelProject({
  contextTasks,
  childrenByParentId,
  focusedTaskId,
}: ProjectFilterOptions): boolean {
  for (const task of contextTasks) {
    if (task.taskType !== "task") continue;
    if (getTaskStatusType(task.status) !== "active") continue;
    const isTopLevelInContext = focusedTaskId
      ? task.parentId === focusedTaskId
      : !task.parentId;
    if (!isTopLevelInContext) continue;
    if (isProjectFromChildrenMap(task.id, childrenByParentId)) return true;
  }
  return false;
}

interface PeopleScopedFilterOptions {
  contextTasks: Task[];
  peopleScope: Set<string>;
  /**
   * When null (unfocused scope), comments are excluded — "My tasks" should not
   * be polluted with reply chatter at the top level. Within a focused task,
   * comments are kept since the user is intentionally browsing a thread.
   */
  focusedTaskId: string | null;
}

/**
 * "My tasks" feed: tasks within the current scope that belong to the people
 * scope. With no sidebar people selected and a signed-in user, this maps to
 * "tasks assigned to me or that I created and did not assign".
 */
export function selectPeopleOwnedTasks({
  contextTasks,
  peopleScope,
  focusedTaskId,
}: PeopleScopedFilterOptions): Task[] {
  if (peopleScope.size === 0) return [];
  return contextTasks.filter((task) => {
    if (!focusedTaskId && task.taskType === "comment") return false;
    return isTaskOwnedByAny(task, peopleScope);
  });
}

interface TimelineFilterOptions {
  contextTasks: Task[];
  focusedTaskId: string | null;
  peopleScope: Set<string>;
}

/**
 * Activity timeline: top-level tasks/posts of the current context PLUS any
 * comments inside the context, ordered newest first. State-change events are
 * excluded by construction (we only consider tasks/posts, never `state-update`
 * feed entries). When a people scope is active, entries must be owned by one
 * of those people.
 */
export function selectStatusTimelinePosts({
  contextTasks,
  focusedTaskId,
  peopleScope,
}: TimelineFilterOptions): Task[] {
  const matching = contextTasks.filter((task) => {
    if (task.taskType !== "comment") {
      const isTopLevelInContext = focusedTaskId
        ? task.parentId === focusedTaskId
        : !task.parentId;
      if (!isTopLevelInContext) return false;
    }
    if (peopleScope.size > 0 && !isTaskOwnedByAny(task, peopleScope)) {
      return false;
    }
    return true;
  });
  return [...matching].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
