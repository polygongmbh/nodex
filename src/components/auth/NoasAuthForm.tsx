import { useState } from "react";
import { Button } from "../ui/button";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NoasSharedFields, validateNoasBaseUrl, validateNoasUsername } from "./NoasSharedFields";
import { normalizeNoasBaseUrl } from "@/lib/nostr/noas-client";

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

    const normalizedNoasBaseUrl = normalizeNoasBaseUrl(noasHostUrl);
    const noasHostError = validateNoasBaseUrl(normalizedNoasBaseUrl, t);
    if (noasHostError) {
      setLocalError(noasHostError);
      return;
    }

    const success = await onLogin(username.trim(), password, {
      baseUrl: normalizedNoasBaseUrl,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 border-b pb-2 pr-10">
        <button type="button" className="text-sm font-medium text-primary border-b-2 border-primary pb-2 -mb-[9px]">
          {t("auth.signIn")}
        </button>
        <button
          type="button"
          onClick={onSignUp}
          disabled={isLoading}
          className="text-sm font-medium text-muted-foreground hover:text-foreground pb-2 -mb-[9px]"
        >
          {t("auth.signUp")}
        </button>
      </div>

      {displayedError ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{displayedError}</span>
        </div>
      ) : null}

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

      <div>
        <Button type="button" variant="outline" onClick={onBack} disabled={isLoading} className="w-full">
          {t("auth.noas.moreOptions")}
        </Button>
      </div>
    </div>
  );
}
