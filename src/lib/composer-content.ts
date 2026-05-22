import { stripStandaloneMentionsAndHashtags } from "@/lib/content-tokens";
import type { Nip99Metadata, PublishedAttachment, TitledPostFields } from "@/types";

const LETTER_OR_DIGIT_PATTERN = /[\p{L}\p{N}]/u;

export function hasMeaningfulComposerText(content: string): boolean {
  return LETTER_OR_DIGIT_PATTERN.test(stripStandaloneMentionsAndHashtags(content));
}

/** Any user-entered NIP-99 listing field that represents real content. */
export function hasNip99Content(nip99: Nip99Metadata | undefined | null): boolean {
  if (!nip99) return false;
  const fields = [
    nip99.identifier,
    nip99.price,
    nip99.currency,
    nip99.frequency,
  ];
  return fields.some((field) => typeof field === "string" && field.trim().length > 0);
}

/** Any user-entered title/summary/location counts as real content (listing & event). */
export function hasTitledPostContent(titledPost: TitledPostFields | undefined | null): boolean {
  if (!titledPost) return false;
  const fields = [titledPost.title, titledPost.summary, titledPost.location];
  return fields.some((field) => typeof field === "string" && field.trim().length > 0);
}

/** Any uploaded/published attachment counts as real content worth persisting. */
export function hasComposerAttachmentContent(
  attachments: ReadonlyArray<PublishedAttachment | { url?: string }> | undefined | null
): boolean {
  if (!attachments || attachments.length === 0) return false;
  return attachments.some((attachment) => Boolean(attachment?.url));
}

export interface ComposerSubstanceInput {
  content?: string;
  attachments?: ReadonlyArray<PublishedAttachment | { url?: string }> | null;
  nip99?: Nip99Metadata | null;
  titledPost?: TitledPostFields | null;
}

/**
 * A composer is "substantive" — and therefore worth saving/restoring as a
 * draft — only when the user has entered text, attached media, or filled in
 * listing/event metadata (NIP-99 fields or a title/summary/location).
 * Auxiliary state like a seeded due date, priority, channel filters, or
 * location alone does NOT count, because that state can leak from one
 * context (e.g. the calendar view) into a fresh composer elsewhere.
 */
export function hasComposerSubstance({
  content,
  attachments,
  nip99,
  titledPost,
}: ComposerSubstanceInput): boolean {
  if (typeof content === "string" && hasMeaningfulComposerText(content)) return true;
  if (hasComposerAttachmentContent(attachments)) return true;
  if (hasNip99Content(nip99)) return true;
  if (hasTitledPostContent(titledPost)) return true;
  return false;
}
