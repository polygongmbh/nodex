import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/config";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (SUPPORTED_LANGUAGES.includes(i18n.language as (typeof SUPPORTED_LANGUAGES)[number])
    ? i18n.language
    : "en") as "en" | "de";
  const next = current === "en" ? "de" : "en";

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(next)}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs text-foreground hover:bg-muted"
      title={`${t("language.label")}: ${t(`language.${current}`)}`}
      aria-label={`${t("language.label")}: ${t(`language.${current}`)}`}
    >
      <Globe className="h-3.5 w-3.5" />
      <span>{current.toUpperCase()}</span>
    </button>
  );
}
