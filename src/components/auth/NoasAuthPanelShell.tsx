import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import { useTranslation } from "react-i18next";

interface NoasAuthPanelShellProps {
  mode: "signIn" | "signUp";
  isLoading: boolean;
  error?: string;
  onSignIn?: () => void;
  onSignUp?: () => void;
  onBack?: () => void;
  footerText?: string;
  showBackAction?: boolean;
  children: ReactNode;
}

export function NoasAuthPanelShell({
  mode,
  isLoading,
  error,
  onSignIn,
  onSignUp,
  onBack,
  footerText,
  showBackAction = true,
  children,
}: NoasAuthPanelShellProps) {
  const { t } = useTranslation();
  const isSignIn = mode === "signIn";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 border-b pb-2 pr-10">
        <button
          type="button"
          onClick={isSignIn ? undefined : onSignIn}
          disabled={isLoading || isSignIn}
          className={
            isSignIn
              ? "text-sm font-medium text-primary border-b-2 border-primary pb-2 -mb-[9px]"
              : "text-sm font-medium text-muted-foreground hover:text-foreground pb-2 -mb-[9px]"
          }
        >
          {t("auth.signIn")}
        </button>
        <button
          type="button"
          onClick={isSignIn ? onSignUp : undefined}
          disabled={isLoading || !isSignIn}
          className={
            isSignIn
              ? "text-sm font-medium text-muted-foreground hover:text-foreground pb-2 -mb-[9px]"
              : "text-sm font-medium text-primary border-b-2 border-primary pb-2 -mb-[9px]"
          }
        >
          {t("auth.signUp")}
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      {children}

      <div className={footerText || showBackAction ? "space-y-3 border-t pt-3" : undefined}>
        {footerText ? <p className="text-center text-sm text-muted-foreground">{footerText}</p> : null}
        {showBackAction ? (
          <Button type="button" variant="outline" onClick={onBack} disabled={isLoading} className="w-full">
            {t("auth.noas.moreOptions")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
