import { formatBreadcrumbLabel } from "@/lib/breadcrumb-label";

const CONTEXT_TITLE_MAX_CHARS = 72;
const CONTEXT_TITLE_PREFIX_CHARS = 44;
const CONTEXT_TITLE_SUFFIX_CHARS = 20;

function trimAtWordBoundaryStart(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const slice = value.slice(0, maxChars + 1);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxChars * 0.6)) {
    return slice.slice(0, lastSpace).trimEnd();
  }
  return value.slice(0, maxChars).trimEnd();
}

function trimAtWordBoundaryEnd(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const rawSlice = value.slice(-maxChars - 8);
  const firstSpace = rawSlice.indexOf(" ");
  if (firstSpace >= 0 && firstSpace <= Math.floor(maxChars * 0.35)) {
    const candidate = rawSlice.slice(firstSpace + 1).trimStart();
    if (candidate.length >= maxChars) return candidate;
  }
  return value.slice(-maxChars).trimStart();
}

export function formatContextTaskTitle(title: string): string {
  const normalized = formatBreadcrumbLabel(title).replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= CONTEXT_TITLE_MAX_CHARS) {
    return `"${normalized}"`;
  }

  const prefix = trimAtWordBoundaryStart(normalized, CONTEXT_TITLE_PREFIX_CHARS);
  const suffix = trimAtWordBoundaryEnd(normalized, CONTEXT_TITLE_SUFFIX_CHARS);
  return `"${prefix} ... ${suffix}"`;
}
