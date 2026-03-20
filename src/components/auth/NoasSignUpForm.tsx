import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Loader2, UserPlus, Copy, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getPublicKey } from "nostr-tools";
import { NoasSharedFields, validateNoasUsername } from "./NoasSharedFields";
import { NoasAuthPanelShell } from "./NoasAuthPanelShell";
import { resolveNoasBaseUrlForSubmit } from "./noas-form-helpers";
import { toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";

interface NoasSignUpFormProps {
  onSignUp: (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string }
  ) => Promise<boolean>;
  onSignIn?: () => void;
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

export function NoasSignUpForm({
  onSignUp,
  onSignIn,
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
}: NoasSignUpFormProps) {
  const { t } = useTranslation();
  const [privateKey, setPrivateKey] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const displayedError = localError ?? error;
  const userFacingPubkey = toUserFacingPubkey(pubkey);

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

    const { baseUrl: normalizedNoasBaseUrl, error: noasHostError } = resolveNoasBaseUrlForSubmit(noasHostUrl, t);
    if (noasHostError) {
      setLocalError(noasHostError);
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

    await onSignUp(username.trim(), password, privateKey.trim(), finalPubkey, {
      baseUrl: normalizedNoasBaseUrl,
    });
  };

  return (
    <NoasAuthPanelShell
      mode="signUp"
      isLoading={isLoading}
      error={displayedError || undefined}
      onSignIn={onSignIn}
      footerText={undefined}
      showBackAction={false}
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <NoasSharedFields
          t={t}
          username={username}
          password={password}
          noasHostUrl={noasHostUrl}
          isEditingHostUrl={isEditingHostUrl}
          allowDirectHostEdit={allowDirectHostEdit}
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
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Input
              id="noas-private-key"
              type={showPrivateKey ? "text" : "password"}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={t("auth.noas.privateKeyPlaceholder")}
              disabled={isLoading}
              className="w-full min-w-0 font-mono text-[11px] sm:text-xs"
            />
            {privateKey ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
                disabled={isLoading}
                className="shrink-0"
              >
                <Copy className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            {t("auth.noas.footerText")}
          </p>

          <div className="mt-2 border-t pt-2">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-[11px] leading-4 text-muted-foreground">
              <span className="shrink-0 font-medium uppercase tracking-[0.08em]">
                {t("auth.noas.publicKey")}
              </span>
              <div className="min-w-0 overflow-hidden">
                <div
                  id="noas-public-key"
                  className="overflow-x-auto whitespace-nowrap font-mono text-[11px] text-foreground/85"
                  title={userFacingPubkey || t("auth.noas.publicKeyPlaceholder")}
                >
                  {userFacingPubkey || t("auth.noas.publicKeyPlaceholder")}
                </div>
              </div>
              {pubkey ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(userFacingPubkey);
                    toast.success(t("auth.noas.publicKeyCopied"));
                  }}
                  disabled={isLoading}
                  className="h-7 shrink-0 px-2"
                >
                  <Copy className="h-3.5 w-3.5" />
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
    </NoasAuthPanelShell>
  );
}
