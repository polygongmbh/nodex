import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Loader2, AlertCircle, UserPlus, Copy, RefreshCw, ExternalLink, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getPublicKey } from "nostr-tools";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

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
  isLoading: boolean;
  error?: string;
  noasHostUrl?: string;
  onNoasHostUrlChange?: (value: string) => void;
}

export function NoasSignUpForm({ 
  onSignUp, 
  onBack, 
  onSignIn,
  isLoading, 
  error,
  noasHostUrl = "https://noas.example.com",
  onNoasHostUrlChange,
}: NoasSignUpFormProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [isEditingHostUrl, setIsEditingHostUrl] = useState(false);
  const displayedHost = (() => {
    try {
      return new URL(noasHostUrl).hostname || "noas.example.com";
    } catch {
      return "noas.example.com";
    }
  })();

  // Helper function to derive public key from hex private key
  const derivePublicKeyFromHex = (hexPrivateKey: string): string | null => {
    try {
      // Convert hex string to Uint8Array
      const privateKeyBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        privateKeyBytes[i] = parseInt(hexPrivateKey.substr(i * 2, 2), 16);
      }
      return getPublicKey(privateKeyBytes);
    } catch (error) {
      console.error("Failed to derive public key:", error);
      return null;
    }
  };

  const generatePrivateKey = () => {
    // Generate a random 256-bit hex string for a Nostr private key
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const hexKey = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setPrivateKey(hexKey);
    
    // Auto-generate the corresponding public key
    const derivedPubkey = derivePublicKeyFromHex(hexKey);
    if (derivedPubkey) {
      setPubkey(derivedPubkey);
    } else {
      setPubkey("");
    }
    
    setShowPrivateKey(true);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(privateKey);
    toast.success(t("auth.noas.privateKeyCopied") || "Private key copied to clipboard");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Validate inputs
    if (!username.trim()) {
      setLocalError(t("auth.errors.usernameRequired") || "Username is required");
      return;
    }

    if (username.length < 3 || username.length > 32) {
      setLocalError(t("auth.errors.usernameLength") || "Username must be 3-32 characters");
      return;
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
      setLocalError(
        t("auth.errors.usernameFormat") || 
        "Username must contain only lowercase letters, numbers, and underscores"
      );
      return;
    }

    if (!password) {
      setLocalError(t("auth.errors.passwordRequired") || "Password is required");
      return;
    }

    if (password.length < 8) {
      setLocalError(t("auth.errors.passwordLength") || "Password must be at least 8 characters");
      return;
    }

    if (!privateKey.trim()) {
      setLocalError(t("auth.errors.privateKeyRequired") || "Private key is required");
      return;
    }

    let finalPubkey = pubkey.trim();
    if (!finalPubkey) {
      finalPubkey = derivePublicKeyFromHex(privateKey.trim()) || "";
      if (!finalPubkey) {
        setLocalError(t("auth.errors.pubkeyRequired") || "Public key is required. Please generate a valid private key.");
        return;
      }
    }

    const success = await onSignUp(username.trim(), password, privateKey.trim(), finalPubkey, {
      baseUrl: noasHostUrl.trim(),
    });
    if (!success) {
      setLocalError(t("auth.errors.signUpFailed") || "Sign up failed. Please check your details and try again.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Noas link */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">
            {t("auth.noas.signUpTitle") || "Sign up with Noas"}
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
        {t("auth.noas.signUpDescription") || "Create a new Noas account to use with Nodex"}
      </p>

      {onSignIn ? (
        <div className="flex gap-2 border-b">
          <button
            type="button"
            onClick={onSignIn}
            disabled={isLoading}
            className="pb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("auth.signIn") || "Sign In"}
          </button>
          <button type="button" className="pb-2 text-sm font-medium text-primary border-b-2 border-primary">
            {t("auth.signUp") || "Sign Up"}
          </button>
        </div>
      ) : null}

      {/* Error messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {localError && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{localError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username field */}
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
                  onChange={(e) => onNoasHostUrlChange?.(`https://${e.target.value}`)}
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
          <p className="text-xs text-muted-foreground">
            {t("auth.noas.usernameHint") || "3-32 characters, lowercase letters, numbers, underscores only"}
          </p>
        </div>

        {/* Password field */}
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
            autoComplete="new-password"
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            {t("auth.noas.passwordHint") || "Minimum 8 characters"}
          </p>
        </div>

        <div className="space-y-2 p-3 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between">
            <Label htmlFor="noas-private-key">
              {t("auth.noas.privateKey") || "Private Key"}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={generatePrivateKey}
              disabled={isLoading}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              {t("auth.noas.generate") || "Generate"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              id="noas-private-key"
              type={showPrivateKey ? "text" : "password"}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder={t("auth.noas.privateKeyPlaceholder") || "64-character hex or nsec..."}
              disabled={isLoading}
              className="flex-1 font-mono text-xs"
            />
            {privateKey && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyToClipboard}
                disabled={isLoading}
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("auth.noas.privateKeyWarning") || 
              "Your private key is stored securely. Keep it safe and never share it."}
          </p>

          <div className="mt-3 pt-3 border-t space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="noas-public-key">
                {t("auth.noas.publicKey") || "Public Key"}
              </Label>
            </div>
            <div className="flex gap-2">
              <Input
                id="noas-public-key"
                type="text"
                value={pubkey}
                onChange={(e) => setPubkey(e.target.value.trim())}
                placeholder={t("auth.noas.publicKeyPlaceholder") || "64-character pubkey"}
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
                    toast.success(t("auth.noas.publicKeyCopied") || "Public key copied to clipboard");
                  }}
                  disabled={isLoading}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Submit button */}
        <Button type="submit" disabled={isLoading} className="w-full gap-2">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("auth.signingUp") || "Signing up"}...</span>
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              <span>{t("auth.signUp") || "Sign Up"}</span>
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
