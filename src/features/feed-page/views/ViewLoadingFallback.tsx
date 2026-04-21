import { useTranslation } from "react-i18next";

export function ViewLoadingFallback() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t("app.loadingView")}
    </div>
  );
}
