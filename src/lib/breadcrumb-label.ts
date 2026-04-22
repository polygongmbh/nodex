import { getTrimmedFirstTaskContentLine } from "@/lib/task-content-preview";

export function formatBreadcrumbLabel(content: string): string {
  const firstLine = getTrimmedFirstTaskContentLine(content);
  const withoutMentions = firstLine.replace(/(^|\s)(?:@[^\s]+|nostr:npub1[0-9a-z]+)/gi, "$1 ");
  return withoutMentions
    .replace(/#/g, "")
    .replace(/~~/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
