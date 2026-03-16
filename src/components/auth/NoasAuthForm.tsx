import { useState } from "react";
import { Button } from "../ui/button";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NoasSharedFields, validateNoasUsername } from "./NoasSharedFields";

interface NoasAuthFormProps {
  onLogin: (username: string, password: string, config?: { baseUrl?: string }) => Promise<boolean>;
  onSignUp?: () => void;
  onBack?: () => void;
  isLoading: boolean;
  error?: string;
  noasHostUrl?: string;
  onNoasHostUrlChange?: (value: string) => void;
}

export function NoasAuthForm({
  onLogin,
  onSignUp,
  onBack,
  isLoading,
  error,
  noasHostUrl = "https://noas.example.com",
  onNoasHostUrlChange,
}: NoasAuthFormProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isEditingHostUrl, setIsEditingHostUrl] = useState(false);

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

    const success = await onLogin(username.trim(), password, {
      baseUrl: noasHostUrl.trim(),
    });
    if (!success) {
      setLocalError(t("auth.errors.invalidCredentials"));
    }
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

      {error ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      {localError ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{localError}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <NoasSharedFields
          t={t}
          username={username}
          password={password}
          noasHostUrl={noasHostUrl}
          isEditingHostUrl={isEditingHostUrl}
          isLoading={isLoading}
          passwordAutoComplete="current-password"
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onNoasHostUrlChange={onNoasHostUrlChange}
          onToggleHostEdit={() => setIsEditingHostUrl((current) => !current)}
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

      <div className="space-y-3 border-t pt-4">
        <p className="text-center text-sm text-muted-foreground">{t("auth.noas.footerText")}</p>
        <Button type="button" variant="outline" onClick={onBack} disabled={isLoading} className="w-full">
          {t("auth.noas.moreOptions")}
        </Button>
      </div>
    </div>
  );
}
