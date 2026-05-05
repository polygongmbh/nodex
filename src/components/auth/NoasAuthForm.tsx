import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NoasSharedFields } from "./NoasSharedFields";
import { NoasAuthPanelShell } from "./NoasAuthPanelShell";
import { resolveNoasCredentialsForSubmit } from "./noas-form-helpers";

const TRUST_BROWSER_STORAGE_KEY = "nostr_noas_trust_browser";

interface NoasAuthFormProps {
  onLogin: (username: string, password: string, config?: { baseUrl?: string; trustBrowser?: boolean }) => Promise<boolean>;
  onSignUp?: () => void;
  onBack?: () => void;
  username: string;
  password: string;
  isEditingHostUrl: boolean;
  allowDirectHostEdit?: boolean;
  isLoading: boolean;
  error?: string;
  noasHostUrl?: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNoasHostUrlChange?: (value: string) => void;
  onToggleHostEdit: () => void;
}

export function NoasAuthForm({
  onLogin,
  onSignUp,
  onBack,
  username,
  password,
  isEditingHostUrl,
  allowDirectHostEdit = false,
  isLoading,
  error,
  noasHostUrl = "",
  onUsernameChange,
  onPasswordChange,
  onNoasHostUrlChange,
  onToggleHostEdit,
}: NoasAuthFormProps) {
  const { t } = useTranslation("auth");
  const [localError, setLocalError] = useState<string | null>(null);
  const [trustBrowser, setTrustBrowser] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(TRUST_BROWSER_STORAGE_KEY) === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (trustBrowser) {
      window.localStorage.setItem(TRUST_BROWSER_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(TRUST_BROWSER_STORAGE_KEY);
    }
  }, [trustBrowser]);
  const displayedError = localError ?? error;

  const normalizeUsernameFieldForSubmit = () => {
    const { fullHandle, error: noasCredentialError } = resolveNoasCredentialsForSubmit(username, noasHostUrl, t);
    if (noasCredentialError || !fullHandle) return;
    onUsernameChange(fullHandle);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!password) {
      setLocalError(t("auth.errors.passwordRequired"));
      return;
    }

    const {
      username: normalizedUsername,
      fullHandle: normalizedFullHandle,
      baseUrl: normalizedNoasBaseUrl,
      error: noasCredentialError,
    } =
      resolveNoasCredentialsForSubmit(username, noasHostUrl, t);
    if (noasCredentialError) {
      setLocalError(noasCredentialError);
      return;
    }

    onUsernameChange(normalizedFullHandle);
    await onLogin(normalizedUsername, password, {
      baseUrl: normalizedNoasBaseUrl,
      trustBrowser,
    });
  };

  return (
    <NoasAuthPanelShell
      mode="signIn"
      isLoading={isLoading}
      error={displayedError || undefined}
      onSignUp={onSignUp}
      onBack={onBack}
    >
      <form
        onSubmit={handleSubmit}
        onKeyDownCapture={(event) => {
          if (event.key === "Enter") {
            normalizeUsernameFieldForSubmit();
          }
        }}
        className="space-y-4"
      >
        <NoasSharedFields
          t={t}
          username={username}
          password={password}
          noasHostUrl={noasHostUrl}
          isEditingHostUrl={isEditingHostUrl}
          allowDirectHostEdit={allowDirectHostEdit}
          isLoading={isLoading}
          passwordAutoComplete="current-password"
          onUsernameChange={onUsernameChange}
          onPasswordChange={onPasswordChange}
          onNoasHostUrlChange={onNoasHostUrlChange}
          onToggleHostEdit={onToggleHostEdit}
        />

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={trustBrowser}
            onChange={(e) => setTrustBrowser(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span>
            <span className="font-medium">{t("auth.noas.trustBrowser")}</span>
            <span className="block text-xs text-muted-foreground">{t("auth.noas.trustBrowserHint")}</span>
          </span>
        </label>

        <Button
          type="submit"
          data-testid="noas-auth-submit"
          disabled={isLoading}
          className="w-full gap-2"
          onPointerDownCapture={normalizeUsernameFieldForSubmit}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("auth.signingIn")}...</span>
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              <span>{t("auth.signIn")}</span>
            </>
          )}
        </Button>
      </form>
    </NoasAuthPanelShell>
  );
}
