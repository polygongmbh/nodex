import { getTaskStatusType, type Task, type TaskStatusType } from "@/types";

const EPSILON = 0.001;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const IMPORTANCE_BASELINE = 50;

export interface PriorityEvaluationParams {
  /** Decay base for due-date proximity. Urgency = base^-daysUntilDue. */
  dueBase: number;
  /** Per-day overdue multiplier. */
  overdueMultiplier: number;
  /** Cap on the local urgency contribution from any single task. */
  maxUrgency: number;
  /** Weak baseline for tasks without a due date so they remain visible. */
  noDueBaseline: number;
  /** Inverse-time decay exponent for touches (higher = faster decay). */
  frecencyDecayExponent: number;
  /** Reference frecency used to soft-normalize the raw sum. */
  frecencyReference: number;
  /** Maximum normalized frecency added to the boost (1 + capped F). */
  maxFrecencyBoost: number;
  /** Dampening for child-to-parent influence: parent + sum(max(0, child - parent)/c). */
  childInfluenceDampening: number;
}

export const DEFAULT_PRIORITY_PARAMS: PriorityEvaluationParams = {
  dueBase: 1.1,
  overdueMultiplier: 0.25,
  maxUrgency: 10,
  noDueBaseline: 0.1,
  frecencyDecayExponent: 0.1,
  frecencyReference: 10,
  maxFrecencyBoost: 3,
  childInfluenceDampening: 3,
};

export interface PriorityScore {
  urgency: number;
  importance: number;
  frecencyBoost: number;
  progress: number;
  priority: number;
}

function isTerminal(status: TaskStatusType): boolean {
  return status === "done" || status === "closed";
}

function isEvaluable(task: Task): boolean {
  if (task.taskType === "comment") return false;
  return !isTerminal(getTaskStatusType(task.status));
}

function daysUntil(target: Date, now: number): number {
  return (target.getTime() - now) / MS_PER_DAY;
}

function minutesSince(target: Date, now: number): number {
  return Math.max((now - target.getTime()) / MS_PER_MINUTE, 1);
}

function getImportance(task: Task): number {
  if (typeof task.priority === "number" && Number.isFinite(task.priority)) {
    return Math.max(task.priority / IMPORTANCE_BASELINE, EPSILON);
  }
  return 1;
}

export function calculateLocalUrgency(
  task: Task,
  now: number,
  params: PriorityEvaluationParams = DEFAULT_PRIORITY_PARAMS,
): number {
  if (!task.dueDate) return params.noDueBaseline;
  const remaining = daysUntil(task.dueDate, now);
  if (remaining < 0) {
    return Math.min(1 + params.overdueMultiplier * Math.abs(remaining), params.maxUrgency);
  }
  return Math.pow(params.dueBase, -remaining);
}

export function buildChildrenMap(tasks: readonly Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    let bucket = map.get(task.parentId);
    if (!bucket) {
      bucket = [];
      map.set(task.parentId, bucket);
    }
    bucket.push(task);
  }
  return map;
}

function getSubtasks(taskId: string, childrenMap: Map<string, Task[]>): Task[] {
  const all = childrenMap.get(taskId) ?? [];
  return all.filter((child) => child.taskType !== "comment" && getTaskStatusType(child.status) !== "closed");
}

export function calculateProgress(
  task: Task,
  childrenMap: Map<string, Task[]>,
  cache: Map<string, number> = new Map(),
): number {
  const cached = cache.get(task.id);
  if (cached !== undefined) return cached;

  const subtasks = getSubtasks(task.id, childrenMap);
  if (subtasks.length === 0) {
    const value = isTerminal(getTaskStatusType(task.status)) ? 1 : 0;
    cache.set(task.id, value);
    return value;
  }

  let sum = 0;
  for (const child of subtasks) {
    sum += calculateProgress(child, childrenMap, cache);
  }
  const value = sum / subtasks.length;
  cache.set(task.id, value);
  return value;
}

function gatherTouches(task: Task, childrenMap: Map<string, Task[]>): Date[] {
  const out: Date[] = [];
  for (const update of task.stateUpdates ?? []) {
    out.push(update.timestamp);
  }
  for (const child of childrenMap.get(task.id) ?? []) {
    if (child.taskType === "comment") out.push(child.timestamp);
  }
  return out;
}

export function calculateFrecency(
  task: Task,
  childrenMap: Map<string, Task[]>,
  now: number,
  params: PriorityEvaluationParams = DEFAULT_PRIORITY_PARAMS,
): number {
  const touches = gatherTouches(task, childrenMap);
  if (touches.length === 0) return 1;

  let raw = 0;
  for (const at of touches) {
    raw += 1 / Math.pow(minutesSince(at, now), params.frecencyDecayExponent);
  }
  const normalized = Math.log(1 + raw) / Math.log(1 + params.frecencyReference);
  return 1 + Math.min(normalized, params.maxFrecencyBoost);
}

export function geometricMean(values: readonly number[]): number {
  if (values.length === 0) return 1;
  let logSum = 0;
  for (const v of values) {
    logSum += Math.log(Math.max(v, EPSILON));
  }
  return Math.exp(logSum / values.length);
}

export function selfSum(self: number, influences: readonly number[], dampening: number): number {
  let total = self;
  for (const v of influences) {
    total += Math.max(0, v - self) / dampening;
  }
  return total;
}

function getAncestors(taskId: string, byId: Map<string, Task>): Task[] {
  const path: Task[] = [];
  const visited = new Set<string>();
  let current: string | undefined = taskId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const task = byId.get(current);
    if (!task) break;
    path.unshift(task);
    current = task.parentId;
  }
  return path;
}

function depthOf(taskId: string, byId: Map<string, Task>, cache: Map<string, number>): number {
  const cached = cache.get(taskId);
  if (cached !== undefined) return cached;
  const visited = new Set<string>();
  let depth = 0;
  let current: string | undefined = taskId;
  while (current && !visited.has(current)) {
    visited.add(current);
    const task = byId.get(current);
    if (!task?.parentId) break;
    depth += 1;
    current = task.parentId;
  }
  cache.set(taskId, depth);
  return depth;
}

export function evaluateTaskPriorities(
  tasks: readonly Task[],
  now: number = Date.now(),
  params: PriorityEvaluationParams = DEFAULT_PRIORITY_PARAMS,
): Map<string, PriorityScore> {
  const byId = new Map<string, Task>(tasks.map((t) => [t.id, t]));
  const childrenMap = buildChildrenMap(tasks);
  const evaluable = tasks.filter(isEvaluable);
  const evaluableIds = new Set(evaluable.map((t) => t.id));
  const progressCache = new Map<string, number>();

  const localUrgency = new Map<string, number>();
  const importance = new Map<string, number>();
  const frecency = new Map<string, number>();
  for (const task of evaluable) {
    localUrgency.set(task.id, calculateLocalUrgency(task, now, params));
    importance.set(task.id, getImportance(task));
    frecency.set(task.id, calculateFrecency(task, childrenMap, now, params));
  }

  const depthCache = new Map<string, number>();
  const bottomUp = [...evaluable].sort(
    (a, b) => depthOf(b.id, byId, depthCache) - depthOf(a.id, byId, depthCache),
  );

  const raisedUrgency = new Map<string, number>();
  const raisedImportance = new Map<string, number>();
  for (const task of bottomUp) {
    const childTasks = getSubtasks(task.id, childrenMap).filter((c) => evaluableIds.has(c.id));
    const childU = childTasks.map((c) => raisedUrgency.get(c.id) ?? localUrgency.get(c.id) ?? 0);
    const childI = childTasks.map((c) => raisedImportance.get(c.id) ?? importance.get(c.id) ?? 1);
    raisedUrgency.set(
      task.id,
      selfSum(localUrgency.get(task.id) ?? 0, childU, params.childInfluenceDampening),
    );
    raisedImportance.set(
      task.id,
      selfSum(importance.get(task.id) ?? 1, childI, params.childInfluenceDampening),
    );
  }

  const result = new Map<string, PriorityScore>();
  for (const task of evaluable) {
    const ancestors = getAncestors(task.id, byId).filter(isEvaluable);
    const finalU = geometricMean(
      ancestors.map((a) => raisedUrgency.get(a.id) ?? localUrgency.get(a.id) ?? 0),
    );
    const finalI = geometricMean(
      ancestors.map((a) => raisedImportance.get(a.id) ?? importance.get(a.id) ?? 1),
    );
    const f = frecency.get(task.id) ?? 1;
    const progress = calculateProgress(task, childrenMap, progressCache);
    const priority = Math.cbrt(
      Math.max(finalU, EPSILON) * Math.max(finalI, EPSILON) * Math.max(f, EPSILON),
    );
    result.set(task.id, {
      urgency: finalU,
      importance: finalI,
      frecencyBoost: f,
      progress,
      priority,
    });
  }
  return result;
}
