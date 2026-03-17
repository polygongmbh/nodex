import type { FeedMessageType, Nip99ListingStatus, Nip99Metadata } from "@/types";
import { buildGeohashTag } from "@/infrastructure/nostr/geohash-location";
import i18n from "@/lib/i18n/config";

export interface Nip99PublishTagParams {
  metadata?: Nip99Metadata;
  feedMessageType: FeedMessageType;
  hashtags: string[];
  mentionPubkeys: string[];
  attachmentTags?: string[][];
  fallbackTitle?: string;
  identifierSeed?: string;
  statusOverride?: Nip99ListingStatus;
  locationGeohash?: string;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = clean(value)?.toUpperCase();
  return normalized || undefined;
}

function normalizeFrequency(value: string | undefined): string | undefined {
  const normalized = clean(value)?.toLowerCase();
  return normalized || undefined;
}

function parseStatus(value: string | undefined): Nip99ListingStatus | undefined {
  const normalized = clean(value)?.toLowerCase();
  if (normalized === "available") return "active";
  if (normalized === "soldout" || normalized === "sold_out" || normalized === "inactive" || normalized === "closed") {
    return "sold";
  }
  if (normalized === "active" || normalized === "sold") return normalized;
  return undefined;
}

export function parseNip99MetadataFromTags(tags: string[][]): Nip99Metadata | undefined {
  const getFirst = (...names: string[]) =>
    tags.find((tag) => names.includes(tag[0]?.toLowerCase()))?.[1];
  const priceTag = tags.find((tag) => tag[0]?.toLowerCase() === "price");
  const parsedPrice = clean(priceTag?.[1]) || clean(getFirst("amount"));
  const parsedCurrency = normalizeCurrency(priceTag?.[2] || getFirst("currency"));
  const parsedFrequency = normalizeFrequency(priceTag?.[3] || getFirst("frequency", "price_frequency"));

  const metadata: Nip99Metadata = {
    identifier: clean(getFirst("d")),
    title: clean(getFirst("title")),
    summary: clean(getFirst("summary", "description")),
    location: clean(getFirst("location")),
    status: parseStatus(getFirst("status", "state", "availability")),
    publishedAt: clean(getFirst("published_at", "publishedat", "published-at")),
    price: parsedPrice,
    currency: parsedCurrency,
    frequency: parsedFrequency,
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
  locationGeohash,
}: Nip99PublishTagParams): string[][] {
  const identifier =
    clean(metadata?.identifier) ||
    clean(identifierSeed) ||
    `listing-${Date.now().toString(36)}`;
  const status = statusOverride || parseStatus(metadata?.status) || "active";
  const title = clean(metadata?.title) || clean(fallbackTitle) || i18n.t("composer.nip99.defaultTitle");
  const summary = clean(metadata?.summary);
  const location = clean(metadata?.location);
  const price = clean(metadata?.price);
  const currency = normalizeCurrency(metadata?.currency);
  const frequency = normalizeFrequency(metadata?.frequency);
  const publishedAt = clean(metadata?.publishedAt) || String(Math.floor(Date.now() / 1000));

  const tags: string[][] = [
    ["d", identifier],
    ["title", title],
    ["published_at", publishedAt],
    ["publishedAt", publishedAt],
    ["status", status],
    ["type", feedMessageType],
    ...mentionPubkeys.map((pubkey) => ["p", pubkey]),
    ...hashtags.map((tag) => ["t", tag]),
  ];

  if (summary) tags.push(["summary", summary]);
  if (location) tags.push(["location", location]);
  if (price) tags.push(["price", price, currency || "EUR", frequency || ""]);
  if (currency) tags.push(["currency", currency]);
  if (frequency) tags.push(["frequency", frequency]);
  const geohashTag = buildGeohashTag(locationGeohash);
  if (geohashTag) tags.push(geohashTag);

  return [...tags, ...attachmentTags];
}
