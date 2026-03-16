import { useState } from "react";
import { Button } from "../ui/button";
import { Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NoasSharedFields, validateNoasUsername } from "./NoasSharedFields";
import { NoasAuthPanelShell } from "./NoasAuthPanelShell";
import { resolveNoasBaseUrlForSubmit } from "./noas-form-helpers";

interface NoasAuthFormProps {
  onLogin: (username: string, password: string, config?: { baseUrl?: string }) => Promise<boolean>;
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
  const { t } = useTranslation();
  const [localError, setLocalError] = useState<string | null>(null);
  const displayedError = localError ?? error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const usernameError = validateNoasUsername(username, t);
    if (usernameError) {
      setLocalError(usernameError);
      return;
    }

    if (!password) {
      setLocalError(t("auth.errors.passwordRequired"));
      return;
    }

    const { baseUrl: normalizedNoasBaseUrl, error: noasHostError } = resolveNoasBaseUrlForSubmit(noasHostUrl, t);
    if (noasHostError) {
      setLocalError(noasHostError);
      return;
    }

    await onLogin(username.trim(), password, {
      baseUrl: normalizedNoasBaseUrl,
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
      <form onSubmit={handleSubmit} className="space-y-4">
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

        <Button type="submit" disabled={isLoading} className="w-full gap-2">
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
