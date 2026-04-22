import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import { AppErrorScreen } from "@/components/app/AppErrorScreen";
import { getAppErrorMessage } from "@/lib/app-fatal-error";
import "@/lib/runtime-storage-guard";
import "@/lib/i18n/config";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("App root element #root was not found");
}

const root = createRoot(rootElement);

const showFatalAppError = (error: unknown) => {
  console.error("Fatal application error", { error });
  root.render(<AppErrorScreen errorMessage={getAppErrorMessage(error)} />);
};

window.addEventListener("error", (event) => {
  // Ignore resource load failures (img/script/link) — event.target is an Element, not Window.
  // These are not fatal app errors and should not trigger the full-screen error.
  if (event.target && event.target !== window) {
    return;
  }

  // Ignore opaque cross-origin "Script error." reports. Browsers sanitize cross-origin
  // script errors to a bare message with no error object, filename, or line info.
  // These are typically third-party (extensions, injected scripts) and not actionable;
  // crashing the entire app on them — as observed on iOS Firefox — is worse than ignoring.
  const hasNoErrorObject = !event.error;
  const isOpaqueScriptError =
    hasNoErrorObject &&
    (!event.filename || event.filename === "") &&
    (!event.message || /^Script error\.?$/i.test(event.message));
  if (isOpaqueScriptError) {
    console.warn("Ignoring opaque cross-origin script error", {
      message: event.message,
      filename: event.filename,
    });
    return;
  }

  showFatalAppError(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  // Same guard for opaque cross-origin promise rejections.
  const reason = event.reason;
  const reasonMessage = typeof reason === "string" ? reason : reason?.message;
  if (!reason || (typeof reasonMessage === "string" && /^Script error\.?$/i.test(reasonMessage))) {
    console.warn("Ignoring opaque unhandled rejection", { reason });
    return;
  }
  showFatalAppError(reason);
});

root.render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
