import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n/config";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DropdownTriggerContent } from "@/components/ui/dropdown-trigger-content";

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  en: "🇺🇸",
  de: "🇩🇪",
  es: "🇪🇸",
};

interface LanguageToggleProps {
  className?: string;
  showLabelOnMobile?: boolean;
}

function resolveCurrentLanguage(language: string): SupportedLanguage {
  const lower = language.toLowerCase();
  return SUPPORTED_LANGUAGES.find((candidate) => lower.startsWith(candidate)) ?? DEFAULT_LANGUAGE;
}

export function LanguageToggle({ className, showLabelOnMobile = false }: LanguageToggleProps) {
  const { i18n, t } = useTranslation();
  const current = resolveCurrentLanguage(i18n.resolvedLanguage || i18n.language);
  const currentLabel = t(`language.${current}`);

  return (
    <Select value={current} onValueChange={(next) => void i18n.changeLanguage(next)}>
      <SelectTrigger
        hideIndicator
        className={cn(
          "h-9 w-9 min-w-0 rounded-md border-transparent bg-transparent px-1.5 text-xs shadow-none hover:bg-accent/60 hover:text-accent-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-accent-foreground focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 lg:w-auto xl:h-10 xl:w-[8.25rem] xl:px-2 xl:text-sm",
          className,
        )}
        aria-label={`${t("language.label")}: ${currentLabel}`}
        title={`${t("language.label")}: ${currentLabel}`}
      >
        <DropdownTriggerContent
          className={cn("w-full", showLabelOnMobile ? "justify-between" : "justify-center")}
          leading={<span aria-hidden>{LANGUAGE_FLAGS[current]}</span>}
          label={
            showLabelOnMobile ? (
              currentLabel
            ) : (
              <>
                <span className="hidden lg:inline xl:hidden">{current.toUpperCase()}</span>
                <span className="hidden xl:inline">{currentLabel}</span>
              </>
            )
          }
          labelClassName={cn(showLabelOnMobile ? "text-left" : "hidden lg:inline xl:max-w-none")}
          chevronClassName={cn(showLabelOnMobile ? "opacity-70" : "hidden lg:block opacity-70")}
        />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((language) => (
          <SelectItem key={language} value={language}>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden>{LANGUAGE_FLAGS[language]}</span>
              <span>{t(`language.${language}`)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
