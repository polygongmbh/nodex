import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { getTaskLocalDate } from "@/lib/task-dates";
import type { TaskDate, TaskDateType, TaskPost } from "@/types";

/** Inclusive day span, both ends at local midnight. */
export interface GanttSpan {
  start: Date;
  end: Date;
}

export interface GanttMarker {
  date: Date;
  type: TaskDateType;
}

export interface GanttRow {
  task: TaskPost;
  /** Nesting depth relative to the topmost row in the visible set. */
  depth: number;
  span: GanttSpan | null;
  /** True when the span is the union of descendant spans, not the task's own dates. */
  derived: boolean;
  markers: GanttMarker[];
}

function firstLocalDay(dates: TaskDate[], types: TaskDateType[]): Date | undefined {
  for (const type of types) {
    const entry = dates.find((d) => d.type === type);
    const local = entry ? getTaskLocalDate(entry) : undefined;
    if (local) return startOfDay(local);
  }
  return undefined;
}

/**
 * A task's own bar: `start` (or `scheduled`) to `end` (or `due`). A task with
 * only one side gets a single-day bar on it. Milestones never form a bar.
 */
export function getTaskGanttSpan(task: TaskPost): GanttSpan | null {
  const start = firstLocalDay(task.dates, ["start", "scheduled"]);
  const end = firstLocalDay(task.dates, ["end", "due"]);
  if (start && end) return start <= end ? { start, end } : { start: end, end: start };
  const single = start ?? end;
  return single ? { start: single, end: single } : null;
}

export function getTaskGanttMarkers(task: TaskPost): GanttMarker[] {
  return task.dates.flatMap((entry) => {
    if (entry.type !== "milestone") return [];
    const local = getTaskLocalDate(entry);
    return local ? [{ date: startOfDay(local), type: entry.type }] : [];
  });
}

function unionSpan(spans: GanttSpan[]): GanttSpan | null {
  if (spans.length === 0) return null;
  let { start, end } = spans[0];
  for (const span of spans) {
    if (span.start < start) start = span.start;
    if (span.end > end) end = span.end;
  }
  return { start, end };
}

/**
 * Orders the given tasks as a depth-first tree and keeps every task that has
 * dates of its own or a dated descendant. Undated ancestors get a derived
 * summary span covering their descendants, as in a classic Gantt chart.
 * Siblings sort by span start, undated ones last.
 */
export function buildGanttRows(tasks: TaskPost[]): GanttRow[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<string | undefined, TaskPost[]>();
  for (const task of tasks) {
    const parentKey = task.parentId && byId.has(task.parentId) ? task.parentId : undefined;
    const bucket = children.get(parentKey);
    if (bucket) bucket.push(task);
    else children.set(parentKey, [task]);
  }

  type Node = { task: TaskPost; span: GanttSpan | null; derived: boolean; markers: GanttMarker[]; kids: Node[] };
  const visiting = new Set<string>();
  const build = (task: TaskPost): Node | null => {
    if (visiting.has(task.id)) return null;
    visiting.add(task.id);
    const kids = (children.get(task.id) ?? []).map(build).filter((node): node is Node => node !== null);
    visiting.delete(task.id);
    const ownSpan = getTaskGanttSpan(task);
    const markers = getTaskGanttMarkers(task);
    const kidSpan = ownSpan ? null : unionSpan(kids.flatMap((kid) => (kid.span ? [kid.span] : [])));
    const span = ownSpan ?? kidSpan;
    if (!span && markers.length === 0 && kids.length === 0) return null;
    return { task, span, derived: !ownSpan && Boolean(kidSpan), markers, kids };
  };

  const byStart = (a: Node, b: Node) => {
    const aTime = a.span?.start.getTime() ?? a.markers[0]?.date.getTime() ?? Infinity;
    const bTime = b.span?.start.getTime() ?? b.markers[0]?.date.getTime() ?? Infinity;
    return aTime - bTime || a.task.content.localeCompare(b.task.content);
  };

  const rows: GanttRow[] = [];
  const emit = (nodes: Node[], depth: number) => {
    for (const node of [...nodes].sort(byStart)) {
      rows.push({ task: node.task, depth, span: node.span, derived: node.derived, markers: node.markers });
      emit(node.kids, depth + 1);
    }
  };
  emit(
    (children.get(undefined) ?? []).map(build).filter((node): node is Node => node !== null),
    0
  );
  return rows;
}

/**
 * Visible day range: every bar and marker plus today, padded on both sides so
 * edge bars don't touch the viewport border.
 */
export function getGanttRange(rows: GanttRow[], today: Date, paddingDays = 7): GanttSpan {
  let start = startOfDay(today);
  let end = start;
  for (const row of rows) {
    const dates = [...(row.span ? [row.span.start, row.span.end] : []), ...row.markers.map((m) => m.date)];
    for (const date of dates) {
      if (date < start) start = date;
      if (date > end) end = date;
    }
  }
  return { start: addDays(start, -paddingDays), end: addDays(end, paddingDays) };
}

/** Day offset of `date` from the range start (0-based). */
export function ganttDayOffset(range: GanttSpan, date: Date): number {
  return differenceInCalendarDays(date, range.start);
}
