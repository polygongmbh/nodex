export const TASK_INTERACTION_STYLES = {
  hoverText: "task-hover-text",
  cardSurface: "task-card-surface",
  hoverLinkText: "task-hover-link",
  hashtagChip: "task-hashtag-chip",
  inlineLink: "task-inline-link",
} as const;

export const TASK_CHIP_STYLES = {
  base: "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded px-2 py-1 text-xs font-medium leading-none",
  muted: "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded bg-muted px-2 py-1 text-xs font-medium leading-none text-muted-foreground",
  priority: "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded bg-warning/15 px-2 py-1 text-xs font-medium leading-none text-warning",
  mention: "inline-flex h-7 shrink-0 items-center whitespace-nowrap gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-medium leading-none text-primary",
} as const;
