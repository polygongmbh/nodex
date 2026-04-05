import { useTranslation } from "react-i18next";
import { reloadAppWithCacheBypass } from "@/lib/app-fatal-error";

export function AppViewFallback() {
  const { t } = useTranslation();

  return (
    <div
      data-view-fallback="shell"
      className="flex h-full min-h-0 items-center justify-center px-4 py-6"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/90 px-5 py-5 text-center shadow-md backdrop-blur-sm">
        <p className="text-base font-medium text-foreground sm:text-lg">
          {t("app.loadingView")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("appError.description")}
        </p>
        <button
          type="button"
          onClick={() => reloadAppWithCacheBypass()}
          className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("appError.reload")}
        </button>
      </div>
    </div>
  );
}
