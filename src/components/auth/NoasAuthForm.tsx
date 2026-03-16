import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Loader2, AlertCircle, LogIn, ExternalLink, Pencil, KeyRound, ShieldCheck, AppWindow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

interface NoasAuthFormProps {
  onLogin: (username: string, password: string, config?: { baseUrl?: string }) => Promise<boolean>;
  onSignUp?: () => void;
  onBack?: () => void;
  onChooseExtension?: () => void;
  onChooseSigner?: () => void;
  onChoosePrivateKey?: () => void;
  isLoading: boolean;
  error?: string;
  noasHostUrl?: string;
  onNoasHostUrlChange?: (value: string) => void;
}

export function NoasAuthForm({
  onLogin,
  onSignUp,
  onBack,
  onChooseExtension,
  onChooseSigner,
  onChoosePrivateKey,
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
  const parsedNoasUrl = (() => {
    try {
      return new URL(noasHostUrl);
    } catch {
      return null;
    }
  })();
  const displayedHost = parsedNoasUrl?.host || "noas.example.com";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    
    if (!username.trim()) {
      setLocalError(t("auth.errors.usernameRequired") || "Username is required");
      return;
    }
    
    if (!password) {
      setLocalError(t("auth.errors.passwordRequired") || "Password is required");
      return;
    }

    const success = await onLogin(username.trim(), password, {
      baseUrl: noasHostUrl.trim(),
    });
    if (!success) {
      setLocalError(t("auth.errors.invalidCredentials") || "Invalid username or password");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">
            {t("auth.noas.signInTitle") || "Sign in with Noas"}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-xs"
            title={t("auth.noas.signerAppForNoas") || "Signer app for Noas"}
          >
            <a href={noasHostUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={isLoading}>
            {t("auth.back") || "Back"}
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        {t("auth.noas.description") || "Sign in with your Noas account username and password"}
      </p>

      {onSignUp ? (
        <div className="flex gap-2 border-b">
          <button type="button" className="pb-2 text-sm font-medium text-primary border-b-2 border-primary">
            {t("auth.signIn") || "Sign In"}
          </button>
          <button
            type="button"
            onClick={onSignUp}
            disabled={isLoading}
            className="pb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("auth.signUp") || "Sign Up"}
          </button>
        </div>
      ) : null}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {localError && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-md text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{localError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="noas-username">
            {t("auth.username") || "Username"}
          </Label>
          <div className="flex gap-2">
            <Input
              id="noas-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              placeholder={t("auth.usernamePlaceholder") || "your-username"}
              disabled={isLoading}
              autoComplete="username"
              className="flex-1"
            />
            <div className="space-y-1">
              <div className="flex w-44 items-center gap-1 rounded-md border bg-muted px-2">
                <Input
                  value={displayedHost}
                  readOnly={!isEditingHostUrl}
                  onChange={(e) => onNoasHostUrlChange?.(`${parsedNoasUrl?.protocol || "https:"}//${e.target.value}`)}
                  aria-label={t("auth.noas.domain") || "Domain"}
                  className="h-8 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingHostUrl((current) => !current)}
                        disabled={isLoading}
                        aria-pressed={isEditingHostUrl}
                        aria-label={t("auth.noas.editUrl") || "Edit Noas URL"}
                        className="h-7 w-7 px-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("auth.noas.editUrlWarning") || "Only change this if you are sure you know what you are doing."}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="w-44 text-[11px] text-muted-foreground">
                {t("auth.noas.urlHint") || "Advanced: edit only if you intentionally use a different Noas host."}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="noas-password">
            {t("auth.password") || "Password"}
          </Label>
          <Input
            id="noas-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder") || "••••••••"}
            disabled={isLoading}
            autoComplete="current-password"
            className="w-full"
          />
        </div>

        <Button type="submit" disabled={isLoading} className="w-full gap-2">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("auth.signingIn") || "Signing in"}...</span>
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              <span>{t("auth.signIn") || "Sign In"}</span>
            </>
          )}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        <p>
          {t("auth.noas.footerText") || "Your keys are encrypted and never leave your device"}
        </p>
      </div>

      {onBack ? (
        <div className="space-y-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onChooseExtension}
            disabled={isLoading}
            className="w-full gap-2"
          >
            <AppWindow className="h-4 w-4" />
            {t("auth.noas.signerExtension") || "Signer Extension"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onChooseSigner} disabled={isLoading} className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              {t("auth.modal.signerApp") || "Signer App / Bunker"}
            </Button>
            <Button type="button" variant="outline" onClick={onChoosePrivateKey} disabled={isLoading} className="gap-2">
              <KeyRound className="h-4 w-4" />
              {t("auth.modal.privateKey") || "Private Key"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
