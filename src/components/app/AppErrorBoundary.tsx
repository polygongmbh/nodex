import { Component, type ErrorInfo, type ReactNode } from "react";
import { AppErrorScreen } from "@/components/app/AppErrorScreen";
import {
  consumeReloadSearchParam,
  markChunkErrorReloadAttempted,
  reloadAppWithCacheBypass,
  shouldRetryChunkErrorOnce,
} from "@/lib/app-fatal-error";
import i18n from "@/lib/i18n/config";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

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
    if (!shouldRetryChunkErrorOnce()) {
      console.warn("Chunk import failed after automatic reload attempt", { message: error.message });
      return;
    }

    markChunkErrorReloadAttempted();
    console.warn("Chunk import failed, reloading once with cache bypass", { message: error.message });
    reloadAppWithCacheBypass();
  };

  componentDidMount(): void {
    consumeReloadSearchParam();
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return <AppErrorScreen errorMessage={this.state.errorMessage} />;
  }
}
