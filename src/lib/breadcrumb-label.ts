export function formatBreadcrumbLabel(content: string): string {
  const firstLine = (content || "").trimStart().split(/\r?\n/, 1)[0] || "";
  const withoutMentions = firstLine.replace(/(^|\s)@[^\s]+/g, "$1 ");
  const withoutHashtagMarkers = withoutMentions.replace(/#/g, " ");
  const withoutSymbols = withoutHashtagMarkers.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return withoutSymbols.replace(/\s+/g, " ").trim();
}
