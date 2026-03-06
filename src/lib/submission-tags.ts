import type { Task } from "@/types";

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

export function resolveSubmissionTags(
  extractedTags: string[],
  parentTask?: Pick<Task, "tags">
): { submissionTags: string[]; usedParentFallback: boolean } {
  const normalizedExtractedTags = normalizeTags(extractedTags);
  if (normalizedExtractedTags.length > 0) {
    return { submissionTags: normalizedExtractedTags, usedParentFallback: false };
  }

  const normalizedParentTags = normalizeTags(parentTask?.tags || []);
  if (normalizedParentTags.length > 0) {
    return { submissionTags: normalizedParentTags, usedParentFallback: true };
  }

  return { submissionTags: [], usedParentFallback: false };
}
