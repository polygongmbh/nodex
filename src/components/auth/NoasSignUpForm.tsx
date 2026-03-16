import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Loader2, AlertCircle, UserPlus, Copy, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getPublicKey } from "nostr-tools";
import { NoasSharedFields, validateNoasUsername } from "./NoasSharedFields";

interface NoasSignUpFormProps {
  onSignUp: (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string }
  ) => Promise<boolean>;
  onBack?: () => void;
  onSignIn?: () => void;
  username: string;
  password: string;
  isEditingHostUrl: boolean;
  isLoading: boolean;
  error?: string;
  noasHostUrl?: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNoasHostUrlChange?: (value: string) => void;
  onToggleHostEdit: () => void;
}

export function NoasSignUpForm({
  onSignUp,
  onBack,
  onSignIn,
  username,
  password,
  isEditingHostUrl,
  isLoading,
  error,
  noasHostUrl = "https://noas.example.com",
  onUsernameChange,
  onPasswordChange,
  onNoasHostUrlChange,
  onToggleHostEdit,
}: NoasSignUpFormProps) {
  const { t } = useTranslation();
  const [privateKey, setPrivateKey] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const derivePublicKeyFromHex = (hexPrivateKey: string): string | null => {
    try {
      const privateKeyBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        privateKeyBytes[i] = parseInt(hexPrivateKey.substr(i * 2, 2), 16);
      }
      return getPublicKey(privateKeyBytes);
    } catch (deriveError) {
      console.error("Failed to derive public key:", deriveError);
      return null;
    }
  };

  const generatePrivateKey = () => {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const hexKey = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setPrivateKey(hexKey);

    const derivedPubkey = derivePublicKeyFromHex(hexKey);
    setPubkey(derivedPubkey || "");
    setShowPrivateKey(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(privateKey);
    toast.success(t("auth.noas.privateKeyCopied"));
  };

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

    if (password.length < 8) {
      setLocalError(t("auth.errors.passwordLength"));
      return;
    }

    if (!privateKey.trim()) {
      setLocalError(t("auth.errors.privateKeyRequired"));
      return;
    }

    let finalPubkey = pubkey.trim();
    if (!finalPubkey) {
      finalPubkey = derivePublicKeyFromHex(privateKey.trim()) || "";
      if (!finalPubkey) {
        setLocalError(t("auth.errors.pubkeyRequired"));
        return;
      }
    }

    const success = await onSignUp(username.trim(), password, privateKey.trim(), finalPubkey, {
      baseUrl: noasHostUrl.trim(),
    });
    if (!success) {
      setLocalError(t("auth.errors.signUpFailed"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 border-b pb-2 pr-10">
        <button
          type="button"
          onClick={onSignIn}
          disabled={isLoading}
          className="text-sm font-medium text-muted-foreground hover:text-foreground pb-2 -mb-[9px]"
        >
          {t("auth.signIn")}
        </button>
        <button type="button" className="text-sm font-medium text-primary border-b-2 border-primary pb-2 -mb-[9px]">
          {t("auth.signUp")}
        </button>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      {localError ? (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
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
          showUsernameHint
          passwordAutoComplete="new-password"
          onUsernameChange={onUsernameChange}
          onPasswordChange={onPasswordChange}
          onNoasHostUrlChange={onNoasHostUrlChange}
          onToggleHostEdit={onToggleHostEdit}
        />

        <div className="space-y-2 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="noas-private-key">{t("auth.noas.privateKey")}</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={generatePrivateKey}
              disabled={isLoading}
              className="text-xs"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              {t("auth.noas.generate")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              id="noas-private-key"
              type={showPrivateKey ? "text" : "password"}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={t("auth.noas.privateKeyPlaceholder")}
              disabled={isLoading}
              className="flex-1 font-mono text-xs"
            />
            {privateKey ? (
              <Button type="button" variant="ghost" size="sm" onClick={copyToClipboard} disabled={isLoading}>
                <Copy className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t("auth.noas.privateKeyWarning")}</p>

          <div className="mt-3 space-y-2 border-t pt-3">
            <Label htmlFor="noas-public-key">{t("auth.noas.publicKey")}</Label>
            <div className="flex gap-2">
              <Input
                id="noas-public-key"
                type="text"
                value={pubkey}
                onChange={(e) => setPubkey(e.target.value.trim())}
                placeholder={t("auth.noas.publicKeyPlaceholder")}
                disabled={isLoading}
                className="flex-1 font-mono text-xs"
              />
              {pubkey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(pubkey);
                    toast.success(t("auth.noas.publicKeyCopied"));
                  }}
                  disabled={isLoading}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <Button type="submit" disabled={isLoading} className="w-full gap-2">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("auth.signingUp")}...</span>
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              <span>{t("auth.signUp")}</span>
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
