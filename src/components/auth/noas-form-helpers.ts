import type { TFunction } from "i18next";
import { normalizeNoasBaseUrl } from "@/lib/nostr/noas-client";
import { validateNoasBaseUrl } from "./NoasSharedFields";

export function resolveNoasHostDisplayValue(noasHostUrl: string | undefined): string {
  const normalizedNoasHostUrl = normalizeNoasBaseUrl(noasHostUrl || "");
  if (!normalizedNoasHostUrl) return "";

  return normalizedNoasHostUrl.replace(/^https:\/\//i, "");
}

export function resolveNoasBaseUrlForSubmit(noasHostUrl: string | undefined, t: TFunction) {
  const baseUrl = normalizeNoasBaseUrl(noasHostUrl || "");
  const error = validateNoasBaseUrl(baseUrl, t);

  return {
    baseUrl,
    error,
  };
}
