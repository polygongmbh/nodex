import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogIn, Sparkles, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OverlayScrim, OVERLAY_SCRIM_FADE_MS } from "@/components/ui/overlay-scrim";

const INTRO_FADE_DURATION_MS = OVERLAY_SCRIM_FADE_MS;

interface OnboardingIntroPopoverProps {
  isOpen: boolean;
  showCreateAccount?: boolean;
  onStartTour: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}

export function OnboardingIntroPopover({
  isOpen,
  showCreateAccount = false,
  onStartTour,
  onCreateAccount,
  onSignIn,
}: OnboardingIntroPopoverProps) {
  const { t } = useTranslation("onboarding");
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      let secondAnimationFrame = 0;
      const firstAnimationFrame = window.requestAnimationFrame(() => {
        secondAnimationFrame = window.requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });

      return () => {
        window.cancelAnimationFrame(firstAnimationFrame);
        window.cancelAnimationFrame(secondAnimationFrame);
      };
    }

    setIsVisible(false);
    if (!isRendered) {
      return;
    }

    const closeTimeout = window.setTimeout(() => {
      setIsRendered(false);
    }, INTRO_FADE_DURATION_MS);

    return () => {
      window.clearTimeout(closeTimeout);
    };
  }, [isOpen, isRendered]);

  if (!isRendered) return null;

  const state = isVisible ? "open" : "closed";
  const dialogStyle = {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateY(0)" : "translateY(12px)",
    transitionDuration: `${INTRO_FADE_DURATION_MS}ms`,
  } as const;

  return (
    <>
      <OverlayScrim isOpen={isVisible} zIndex={134} />
      <div
        className="fixed inset-0 z-[135] flex items-center justify-center pointer-events-none"
        data-state={state}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("onboarding.intro.ariaLabel")}
          className="relative mx-2 w-full max-w-lg rounded-xl border border-border bg-card/95 p-6 text-card-foreground shadow-xl backdrop-blur-md transition-all pointer-events-auto"
          data-state={state}
          style={dialogStyle}
        >
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">{t("onboarding.intro.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("onboarding.intro.description")}</p>
            <p className="text-sm text-muted-foreground">{t("onboarding.intro.features")}</p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {showCreateAccount ? (
              <Button variant="outline" onClick={onCreateAccount}>
                <UserPlus className="h-4 w-4" />
                {t("onboarding.intro.createAccount")}
              </Button>
            ) : null}
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
    </>
  );
}
