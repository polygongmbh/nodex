import type { FeedMessageType, Nip99ListingStatus, Nip99Metadata } from "@/types";

export interface Nip99PublishTagParams {
  metadata?: Nip99Metadata;
  feedMessageType: FeedMessageType;
  hashtags: string[];
  mentionPubkeys: string[];
  attachmentTags?: string[][];
  fallbackTitle?: string;
  identifierSeed?: string;
  statusOverride?: Nip99ListingStatus;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseStatus(value: string | undefined): Nip99ListingStatus | undefined {
  const normalized = clean(value)?.toLowerCase();
  if (normalized === "active" || normalized === "sold") return normalized;
  return undefined;
}

export function parseNip99MetadataFromTags(tags: string[][]): Nip99Metadata | undefined {
  const getFirst = (name: string) => tags.find((tag) => tag[0]?.toLowerCase() === name)?.[1];
  const priceTag = tags.find((tag) => tag[0]?.toLowerCase() === "price");

  const metadata: Nip99Metadata = {
    identifier: clean(getFirst("d")),
    title: clean(getFirst("title")),
    summary: clean(getFirst("summary")),
    location: clean(getFirst("location")),
    status: parseStatus(getFirst("status")),
    publishedAt: clean(getFirst("published_at")),
    price: clean(priceTag?.[1]),
    currency: clean(priceTag?.[2]),
    frequency: clean(priceTag?.[3]),
  };

  if (!Object.values(metadata).some(Boolean)) return undefined;
  return metadata;
}

export function buildNip99PublishTags({
  metadata,
  feedMessageType,
  hashtags,
  mentionPubkeys,
  attachmentTags = [],
  fallbackTitle,
  identifierSeed,
  statusOverride,
}: Nip99PublishTagParams): string[][] {
  const identifier =
    clean(metadata?.identifier) ||
    clean(identifierSeed) ||
    `listing-${Date.now().toString(36)}`;
  const status = statusOverride || parseStatus(metadata?.status) || "active";
  const title = clean(metadata?.title) || clean(fallbackTitle) || "Listing";
  const summary = clean(metadata?.summary);
  const location = clean(metadata?.location);
  const price = clean(metadata?.price);
  const currency = clean(metadata?.currency);
  const frequency = clean(metadata?.frequency);
  const publishedAt = clean(metadata?.publishedAt) || String(Math.floor(Date.now() / 1000));

  const tags: string[][] = [
    ["d", identifier],
    ["title", title],
    ["published_at", publishedAt],
    ["status", status],
    ["type", feedMessageType],
    ...mentionPubkeys.map((pubkey) => ["p", pubkey]),
    ...hashtags.map((tag) => ["t", tag]),
  ];

  if (summary) tags.push(["summary", summary]);
  if (location) tags.push(["location", location]);
  if (price) tags.push(["price", price, currency || "USD", frequency || ""]);

  return [...tags, ...attachmentTags];
}
