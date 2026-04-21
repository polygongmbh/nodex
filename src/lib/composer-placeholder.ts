import { formatContextTaskTitle } from "@/lib/context-task-title";
import type { PostType } from "@/types";

interface TranslateFn {
  (key: string, options?: Record<string, unknown>): string;
}

interface BuildComposerPlaceholderParams {
  baseKey?: string;
  postType?: PostType;
  contextTaskTitle?: string;
  channelNames?: string[];
  mentionLabels?: string[];
  includeFallbackGuidance?: boolean;
  locale: string;
  t: TranslateFn;
}

function formatNaturalList(values: string[], locale: string): string {
  const formatter = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
  return formatter.format(values);
}

function dedupeNormalized(values: string[], normalizeValue: (value: string) => string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = normalizeValue(trimmed);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
}

function formatChannelLabels(channelNames: string[], locale: string): string {
  const labels = dedupeNormalized(channelNames, (value) => value.toLowerCase()).map((value) =>
    value.startsWith("#") ? value : `#${value}`
  );
  return labels.length > 0 ? formatNaturalList(labels, locale) : "";
}

function formatMentionLabels(mentionLabels: string[], locale: string): string {
  const labels = dedupeNormalized(mentionLabels, (value) => value.toLowerCase()).map((value) =>
    value.startsWith("@") ? value : `@${value}`
  );
  return labels.length > 0 ? formatNaturalList(labels, locale) : "";
}

export function buildComposerPlaceholder({
  baseKey,
  postType,
  contextTaskTitle = "",
  channelNames = [],
  mentionLabels = [],
  includeFallbackGuidance = true,
  locale,
  t,
}: BuildComposerPlaceholderParams): string {
  const formattedTitle = formatContextTaskTitle(contextTaskTitle);
  const formattedChannels = formatChannelLabels(channelNames, locale);
  const formattedPeople = formatMentionLabels(mentionLabels, locale);

  let placeholder = formattedTitle
    ? t(baseKey ? `${baseKey}.withContext` : `composer.placeholders.base.${postType}.withContext`, { title: formattedTitle })
    : t(baseKey ? `${baseKey}.withoutContext` : `composer.placeholders.base.${postType}.withoutContext`);

  if (formattedChannels) {
    placeholder += ` ${t("composer.placeholders.parts.inChannels", { channels: formattedChannels })}`;
  }

  if (formattedPeople) {
    placeholder += ` ${t("composer.placeholders.parts.mentioningPeople", { people: formattedPeople })}`;
  }

  if (includeFallbackGuidance && !formattedChannels && !formattedPeople) {
    placeholder += `, ${t("composer.placeholders.parts.fallbackGuidance")}`;
  }

  return `${placeholder}...`;
}
