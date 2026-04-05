import { createRoot, type Root } from "react-dom/client";
import { AppErrorScreen } from "@/components/app/AppErrorScreen";
import i18n from "@/lib/i18n/config";

const fatalErrorRoots = new WeakMap<HTMLElement, Root>();

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
  const url = new URL(window.location.href);
  url.searchParams.set("reload", String(Date.now()));
  window.location.replace(url.toString());
}

export function navigateToAppHome() {
  window.location.assign("/");
}

interface RenderFatalAppErrorOptions {
  onGoHome?: () => void;
  onReload?: () => void;
}

export function renderFatalAppError(
  container: HTMLElement,
  error: unknown,
  options: RenderFatalAppErrorOptions = {}
) {
  const root = fatalErrorRoots.get(container) ?? createRoot(container);
  fatalErrorRoots.set(container, root);
  const errorMessage = getAppErrorMessage(error);

  root.render(
    <AppErrorScreen
      errorMessage={errorMessage}
      onReload={options.onReload ?? reloadAppWithCacheBypass}
      onGoHome={options.onGoHome ?? navigateToAppHome}
    />
  );
}
