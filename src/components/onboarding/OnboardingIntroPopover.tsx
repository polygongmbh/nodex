import { Button } from "@/components/ui/button";
import { LogIn, Sparkles, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface OnboardingIntroPopoverProps {
  isOpen: boolean;
  onStartTour: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}

export function OnboardingIntroPopover({
  isOpen,
  onStartTour,
  onCreateAccount,
  onSignIn,
}: OnboardingIntroPopoverProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center pointer-events-auto" role="presentation">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("onboarding.intro.ariaLabel")}
        className="relative mx-2 w-full max-w-lg rounded-xl border border-border bg-card/95 p-6 text-card-foreground shadow-xl backdrop-blur-md"
      >
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">{t("onboarding.intro.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("onboarding.intro.description")}</p>
          <p className="text-sm text-muted-foreground">{t("onboarding.intro.features")}</p>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Button variant="outline" onClick={onCreateAccount}>
            <UserPlus className="h-4 w-4" />
            {t("onboarding.intro.createAccount")}
          </Button>
          <Button variant="outline" onClick={onSignIn}>
            <LogIn className="h-4 w-4" />
            {t("onboarding.intro.signIn")}
          </Button>
          <Button onClick={onStartTour}>
            <Sparkles className="h-4 w-4" />
            {t("onboarding.intro.startTour")}
          </Button>
        </div>
      </div>
    </div>
  );
}
