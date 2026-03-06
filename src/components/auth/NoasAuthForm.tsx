import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Loader2, AlertCircle, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";

interface NoasAuthFormProps {
  onLogin: (username: string, password: string) => Promise<boolean>;
  onBack: () => void;
  isLoading: boolean;
  error?: string;
}

export function NoasAuthForm({ onLogin, onBack, isLoading, error }: NoasAuthFormProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

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

    const success = await onLogin(username.trim(), password);
    if (!success) {
      setLocalError(t("auth.errors.invalidCredentials") || "Invalid username or password");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">
          {t("auth.noas.signInTitle") || "Sign in with Noas"}
        </h3>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={isLoading}>
          {t("auth.back") || "Back"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("auth.noas.description") || "Sign in with your Noas account username and password"}
      </p>

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
          <Input
            id="noas-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("auth.usernamePlaceholder") || "your-username"}
            disabled={isLoading}
            autoComplete="username"
            className="w-full"
          />
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
    </div>
  );
}