import i18n from "@/lib/i18n/config";

const CHUNK_ERROR_RELOAD_KEY = "nodex.chunk-error-reload";

export function getAppErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return i18n.t("appError.unexpected");
}

export function reloadAppWithCacheBypass() {
  clearChunkErrorReloadState();
  const url = new URL(window.location.href);
  url.searchParams.set("reload", String(Date.now()));
  window.location.replace(url.toString());
}

export function navigateToAppHome() {
  window.location.assign("/");
}

export function shouldRetryChunkErrorOnce() {
  return typeof window !== "undefined" && window.sessionStorage.getItem(CHUNK_ERROR_RELOAD_KEY) !== "1";
}

export function markChunkErrorReloadAttempted() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHUNK_ERROR_RELOAD_KEY, "1");
}

export function clearChunkErrorReloadState() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
}

export function consumeReloadSearchParam() {
  if (typeof window === "undefined") return;
  if (!window.location.search.includes("reload=")) {
    clearChunkErrorReloadState();
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("reload");
  window.history.replaceState(window.history.state, "", url.toString());
  clearChunkErrorReloadState();
}
