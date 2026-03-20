const LINE_BREAK_REGEX = /\r?\n/;

export interface TaskContentPreviewOptions {
  collapsedLineCount?: number;
  collapseThresholdLineCount?: number;
  collapseCharacterCount?: number;
}

const DEFAULT_COLLAPSED_LINE_COUNT = 3;
const DEFAULT_COLLAPSE_THRESHOLD_LINE_COUNT = 4;
const DEFAULT_COLLAPSE_CHARACTER_COUNT = 500;

export function getTaskContentLines(content: string): string[] {
  return content.split(LINE_BREAK_REGEX);
}

export function getFirstTaskContentLine(content: string): string {
  return getTaskContentLines(content)[0] ?? "";
}

export function shouldCollapseTaskContent(
  content: string,
  options?: TaskContentPreviewOptions
): boolean {
  const collapseThresholdLineCount = options?.collapseThresholdLineCount ?? DEFAULT_COLLAPSE_THRESHOLD_LINE_COUNT;
  const collapseCharacterCount = options?.collapseCharacterCount ?? DEFAULT_COLLAPSE_CHARACTER_COUNT;
  return getTaskContentLines(content).length > collapseThresholdLineCount || content.length > collapseCharacterCount;
}

export function getCollapsedTaskContentPreview(
  content: string,
  options?: TaskContentPreviewOptions
): string {
  const collapsedLineCount = options?.collapsedLineCount ?? DEFAULT_COLLAPSED_LINE_COUNT;
  return getTaskContentLines(content).slice(0, collapsedLineCount).join("\n");
}
