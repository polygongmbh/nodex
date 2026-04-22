import { AlertTriangle } from "lucide-react";
import { navigateToAppHome, reloadAppWithCacheBypass } from "@/lib/app-fatal-error";
import i18n from "@/lib/i18n/config";

interface AppErrorScreenProps {
  errorMessage?: string;
}

export function AppErrorScreen({ errorMessage }: AppErrorScreenProps) {
  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10 flex items-center justify-center">
      <section className="w-full max-w-xl border border-border rounded-2xl bg-card/80 backdrop-blur px-6 py-8 shadow-md">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{i18n.t("app:appError.title")}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          {i18n.t("app:appError.description")}
        </p>
        {errorMessage ? (
          <pre className="text-xs bg-muted/50 border border-border rounded-lg p-3 mb-5 overflow-auto">
            {errorMessage}
          </pre>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={reloadAppWithCacheBypass}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {i18n.t("app:appError.reload")}
          </button>
          <button
            type="button"
            onClick={navigateToAppHome}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted/60"
          >
            {i18n.t("app:appError.goHome")}
          </button>
        </div>
      </section>
    </main>
  );
}
