const PRECISE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatPreciseTimestamp(date: Date): string {
  return PRECISE_TIME_FORMATTER.format(date);
}

export function getTaskCreatedTooltip(date: Date): string {
  return `Task created at ${formatPreciseTimestamp(date)}`;
}

export function getCommentCreatedTooltip(date: Date): string {
  return `Comment created at ${formatPreciseTimestamp(date)}`;
}

export function getStatusUpdatedTooltip(date: Date): string {
  return `Status updated at ${formatPreciseTimestamp(date)}`;
}
