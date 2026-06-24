import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";

const MAX_CONTEXT_LENGTH = 64;
const FALLBACK_INSTANCE = "Nodex";

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Builds the browser tab title as `{context} — {instance}`.
 *
 * - context: the focused task's content (cleaned + truncated) when a task is
 *   open, otherwise the current view label.
 * - instance: the deployment host (e.g. `talk.nodex.io`, `localhost:8080`) so
 *   multiple open Nodex instances stay distinguishable in pinned tabs.
 */
export function buildDocumentTitle(params: {
  focusedTaskContent?: string | null;
  viewLabel?: string | null;
  host: string;
}): string {
  const instance = params.host.trim() || FALLBACK_INSTANCE;
  const taskLabel = params.focusedTaskContent
    ? truncate(formatBreadcrumbLabel(params.focusedTaskContent), MAX_CONTEXT_LENGTH)
    : "";
  const context = taskLabel || (params.viewLabel ?? "").trim();
  return context ? `${context} — ${instance}` : instance;
}
