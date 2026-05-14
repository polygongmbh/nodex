import { getTaskStatus, type Post, type TaskPost, getTaskState, getTaskAssigneePubkeys, isTaskPost } from "@/types";
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

function getNormalizedAssignees(task: Post): string[] {
  return (getTaskAssigneePubkeys(task) ?? []).map(normalizePubkey).filter(Boolean);
}

/**
 * "Owned" by a person = explicitly assigned, OR authored without any assignees.
 * Mirrors the implicit-ownership rule used to pick the avatar shown on a task.
 */
export function isTaskOwnedByAny(task: Post, pubkeys: Set<string>): boolean {
  if (pubkeys.size === 0) return false;
  const assignees = getNormalizedAssignees(task);
  if (assignees.length > 0) {
    return assignees.some((pubkey) => pubkeys.has(pubkey));
  }
  return pubkeys.has(normalizePubkey(task.author?.pubkey));
}

/**
 * Whether a task "concerns" any of the given pubkeys — i.e. one of them is the
 * author OR appears among the assignees. Broader than `isTaskOwnedByAny`:
 * a task you authored but assigned to someone else still concerns you.
 */
export function taskConcernsAny(task: Post, pubkeys: Set<string>): boolean {
  if (pubkeys.size === 0) return false;
  const author = normalizePubkey(task.author?.pubkey);
  if (author && pubkeys.has(author)) return true;
  return getNormalizedAssignees(task).some((pubkey) => pubkeys.has(pubkey));
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

/**
 * Resolve the set of pubkeys whose involvement should *expand* the activity
 * timeline beyond top-level items. Always includes the current user when
 * signed in, plus any sidebar-selected people. Differs from
 * `resolveStatusPeopleScope`: this is additive (it surfaces extra items), not
 * a fallback restriction.
 */
export function resolveStatusConcernsScope(
  selectedPeoplePubkeys: string[],
  currentUserPubkey: string | undefined
): Set<string> {
  const scope = buildPubkeySet(selectedPeoplePubkeys);
  const self = normalizePubkey(currentUserPubkey);
  if (self) scope.add(self);
  return scope;
}

interface TopLevelTaskFilterOptions {
  /** Tasks already pre-scoped by sidebar (relay/channel/people/quick filters). */
  contextTasks: Post[];
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
}: TopLevelTaskFilterOptions): TaskPost[] {
  const result: TaskPost[] = [];
  for (const task of contextTasks) {
    if (!isTaskPost(task)) continue;
    if (getTaskStatus(getTaskState(task)) !== "active") continue;
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
  childrenByParentId: Map<string | undefined, Post[]>;
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
    if (!isTaskPost(task)) continue;
    if (getTaskStatus(getTaskState(task)) !== "active") continue;
    const isTopLevelInContext = focusedTaskId
      ? task.parentId === focusedTaskId
      : !task.parentId;
    if (!isTopLevelInContext) continue;
    if (isProjectFromChildrenMap(task.id, childrenByParentId)) return true;
  }
  return false;
}

interface PeopleScopedFilterOptions {
  contextTasks: Post[];
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
}: PeopleScopedFilterOptions): Post[] {
  if (peopleScope.size === 0) return [];
  return contextTasks.filter((task) => {
    if (!focusedTaskId && !isTaskPost(task)) return false;
    return isTaskOwnedByAny(task, peopleScope);
  });
}

interface TimelineFilterOptions {
  contextTasks: Post[];
  focusedTaskId: string | null;
  /**
   * Pubkeys whose author/assignee involvement should pull non-top-level items
   * into the timeline. Always additive — never used to *restrict* top-level
   * items or comments.
   */
  concernsScope: Set<string>;
}

/**
 * Activity timeline: top-level tasks/posts of the current context, plus any
 * comments inside the context, plus any non-top-level items where someone in
 * `concernsScope` is author or assignee. Ordered newest first. State-change
 * entries are excluded by construction (only tasks/posts are considered, never
 * `state-update` feed entries).
 */
export function selectStatusTimelinePosts({
  contextTasks,
  focusedTaskId,
  concernsScope,
}: TimelineFilterOptions): Post[] {
  const matching = contextTasks.filter((task) => {
    if (!isTaskPost(task)) return true;
    const isTopLevelInContext = focusedTaskId
      ? task.parentId === focusedTaskId
      : !task.parentId;
    if (isTopLevelInContext) return true;
    return taskConcernsAny(task, concernsScope);
  });
  return [...matching].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
