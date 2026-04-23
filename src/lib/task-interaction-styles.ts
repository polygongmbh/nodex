export const TASK_INTERACTION_STYLES = {
  hoverText: "task-hover-text",
  cardSurface: "task-card-surface",
  hoverLinkText: "task-hover-link",
  hashtagChip: "task-hashtag-chip",
  inlineLink: "task-inline-link",
} as const;

const CHIP_BASE =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded p-1 text-xs font-medium leading-none";

export const TASK_CHIP_STYLES = {
  base: CHIP_BASE,
  muted: `${CHIP_BASE} bg-muted text-muted-foreground`,
  priority: `${CHIP_BASE} bg-warning/15 text-warning`,
  mention: `${CHIP_BASE} bg-primary/10 text-primary`,
} as const;
