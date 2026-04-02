import type { TFunction } from "i18next";
import { normalizeNoasBaseUrl } from "@/lib/nostr/noas-discovery";
import { validateNoasBaseUrl, validateNoasUsername } from "./NoasSharedFields";

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

export function resolveNoasCredentialsForSubmit(
  rawValue: string,
  defaultNoasHostUrl: string | undefined,
  t: TFunction
) {
  const trimmedValue = rawValue.trim().toLowerCase();

  if (!trimmedValue) {
    return {
      username: "",
      fullHandle: "",
      baseUrl: "",
      error: t("auth.errors.usernameRequired"),
    };
  }

  const handleParts = trimmedValue.split("@");
  if (handleParts.length > 2) {
    return {
      username: "",
      fullHandle: "",
      baseUrl: "",
      error: t("auth.errors.noasHandleInvalid"),
    };
  }

  const hasExplicitHost = handleParts.length === 2;
  const username = hasExplicitHost ? handleParts[0] ?? "" : trimmedValue;
  const hostValue = hasExplicitHost ? handleParts[1] ?? "" : defaultNoasHostUrl || "";

  const usernameError = validateNoasUsername(username, t);
  if (usernameError) {
    return {
      username: "",
      fullHandle: "",
      baseUrl: "",
      error: usernameError,
    };
  }

  if (!hasExplicitHost && !hostValue.trim()) {
    return {
      username: "",
      fullHandle: "",
      baseUrl: "",
      error: t("auth.errors.noasHandleRequired"),
    };
  }

  const { baseUrl, error } = resolveNoasBaseUrlForSubmit(hostValue, t);
  if (error) {
    return {
      username,
      fullHandle: "",
      baseUrl: "",
      error: hasExplicitHost ? t("auth.errors.noasHandleInvalid") : error,
    };
  }

  return {
    username,
    fullHandle: `${username}@${resolveNoasHostDisplayValue(baseUrl)}`,
    baseUrl,
    error: null,
  };
}
