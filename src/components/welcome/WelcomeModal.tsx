import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogIn, UserPlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  OverlayScrim,
  OVERLAY_SCRIM_FADE_MS,
  OVERLAY_FADE_EASING,
} from "@/components/ui/overlay-scrim";

interface WelcomeModalProps {
  isOpen: boolean;
  showCreateAccount?: boolean;
  onDismiss: () => void;
  onCreateAccount: () => void;
  onSignIn: () => void;
}

export function WelcomeModal({
  isOpen,
  showCreateAccount = false,
  onDismiss,
  onCreateAccount,
  onSignIn,
}: WelcomeModalProps) {
  const { t } = useTranslation(["welcome", "auth"]);
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
    }, OVERLAY_SCRIM_FADE_MS);

    return () => {
      window.clearTimeout(closeTimeout);
    };
  }, [isOpen, isRendered]);

  if (!isRendered) return null;

  const state = isVisible ? "open" : "closed";
  const dialogStyle = {
    opacity: isVisible ? 1 : 0,
    transitionProperty: "opacity",
    transitionDuration: `${OVERLAY_SCRIM_FADE_MS}ms`,
    transitionTimingFunction: OVERLAY_FADE_EASING,
  } as const;

  return (
    <>
      <OverlayScrim isOpen={isOpen} zIndex={134} onClick={onDismiss} />
      <div
        className="fixed inset-0 z-[135] flex items-center justify-center pointer-events-none"
        data-state={state}
        role="presentation"
      >
        <div
          role="dialog"
          className="relative mx-2 w-full max-w-lg rounded-xl border border-border bg-card/95 p-6 text-card-foreground shadow-xl backdrop-blur-md transition-all pointer-events-auto"
          data-state={state}
          style={dialogStyle}
        >
          <button
            type="button"
            onClick={onDismiss}
            data-testid="welcome-dismiss"
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="space-y-3">
            <h2 className="text-center text-xl font-semibold">{t("welcome.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("welcome.description")}</p>
            <p className="text-sm text-muted-foreground">{t("welcome.features")}</p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            {showCreateAccount ? (
              <Button variant="outline" onClick={onCreateAccount}>
                <UserPlus className="h-4 w-4" />
                {t("auth:auth.createAccount")}
              </Button>
            ) : null}
            <Button variant="outline" onClick={onSignIn}>
              <LogIn className="h-4 w-4" />
              {t("auth:auth.signIn")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
