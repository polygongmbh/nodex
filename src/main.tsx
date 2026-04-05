import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import { renderFatalAppError } from "@/lib/app-fatal-error";
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
  renderFatalAppError(rootElement, error);
};

window.addEventListener("error", (event) => {
  showFatalAppError(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  showFatalAppError(event.reason);
});

try {
  root.render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
} catch (error) {
  showFatalAppError(error);
}
