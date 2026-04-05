import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppErrorScreen } from "@/components/app/AppErrorScreen";
import { navigateToAppHome, reloadAppWithCacheBypass } from "@/lib/app-fatal-error";
import i18n from "@/lib/i18n/config";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

const CHUNK_ERROR_RELOAD_KEY = "nodex.chunk-error-reload";
const CHUNK_ERROR_PATTERNS = [
  /Importing a module script failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
];

function isChunkLoadError(error: Error): boolean {
  const message = error?.message ?? "";
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function reloadWithCacheBypass() {
  const url = new URL(window.location.href);
  url.searchParams.set("reload", String(Date.now()));
  window.location.replace(url.toString());
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || i18n.t("appError.unexpected"),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Unhandled application error", { error, errorInfo });

    if (!isChunkLoadError(error)) return;
    if (typeof window === "undefined") return;

    const hasRetried = window.sessionStorage.getItem(CHUNK_ERROR_RELOAD_KEY) === "1";
    if (hasRetried) {
      console.warn("Chunk import failed after automatic reload attempt", { message: error.message });
      return;
    }

    window.sessionStorage.setItem(CHUNK_ERROR_RELOAD_KEY, "1");
    console.warn("Chunk import failed, reloading once with cache bypass", { message: error.message });
    reloadWithCacheBypass();
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
    }
    reloadAppWithCacheBypass();
  };

  handleGoHome = () => {
    navigateToAppHome();
  };

  componentDidMount(): void {
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("reload=")) {
      window.sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("reload");
    window.history.replaceState(window.history.state, "", url.toString());
    window.sessionStorage.removeItem(CHUNK_ERROR_RELOAD_KEY);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <AppErrorScreen
        errorMessage={this.state.errorMessage}
        onReload={this.handleReload}
        onGoHome={this.handleGoHome}
      />
    );
  }
}
