import { useCallback, useEffect, useMemo, useState } from "react";
import { Key, User, Zap, AlertCircle, Loader2, LogOut, BadgeCheck, Copy, Eye, EyeOff, ChevronDown, LogIn, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nip19 } from "nostr-tools";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "react-i18next";
import { resolveCurrentUserProfile } from "@/lib/current-user-profile-cache";
import { formatUserFacingPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { useProfileEditor } from "@/hooks/use-profile-editor";
import { NoasAuthForm } from "./NoasAuthForm";
import { NoasSignUpForm } from "./NoasSignUpForm";
import type { NoasAuthErrorCode } from "@/lib/nostr/noas-client";

interface NostrAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: "choose" | "noas" | "noasSignUp";
}

type AuthStep = "choose" | "privateKey" | "nostrConnect" | "noas" | "noasSignUp";
type PendingAuthMethod = "extension" | "guest" | "privateKey" | "nostrConnect" | "noas" | null;
type WindowWithNostr = Window & { nostr?: unknown };

const HTTP_STATUS_REASON_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  402: "Payment Required",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  407: "Proxy Authentication Required",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  411: "Length Required",
  412: "Precondition Failed",
  413: "Payload Too Large",
  414: "URI Too Long",
  415: "Unsupported Media Type",
  416: "Range Not Satisfiable",
  417: "Expectation Failed",
  418: "I'm a teapot",
  421: "Misdirected Request",
  422: "Unprocessable Entity",
  423: "Locked",
  424: "Failed Dependency",
  425: "Too Early",
  426: "Upgrade Required",
  428: "Precondition Required",
  429: "Too Many Requests",
  431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  506: "Variant Also Negotiates",
  507: "Insufficient Storage",
  508: "Loop Detected",
  510: "Not Extended",
  511: "Network Authentication Required",
};

function resolveNoasErrorMessage(
  errorCode: NoasAuthErrorCode | undefined,
  t: ReturnType<typeof useTranslation>["t"],
  mode: "signIn" | "signUp"
): string {
  if (mode === "signUp") {
    switch (errorCode) {
      case "invalid_url":
      case "missing_config":
        return t("auth.modal.errors.noasSignUpInvalidHost");
      case "connection_failed":
        return t("auth.modal.errors.noasSignUpConnectionFailed");
      case "server_error":
        return t("auth.modal.errors.noasSignUpServerFailed");
      default:
        return t("auth.modal.errors.noasSignUpFailed");
    }
  }

  switch (errorCode) {
    case "invalid_url":
    case "missing_config":
      return t("auth.modal.errors.noasInvalidHost");
    case "connection_failed":
      return t("auth.modal.errors.noasConnectionFailed");
    case "server_error":
    case "decryption_failed":
    case "key_mismatch":
      return t("auth.modal.errors.noasServerFailed");
    default:
      return t("auth.modal.errors.noasFailed");
  }
}

function formatNoasServerErrorPayload(errorMessage: string | undefined, httpStatus: number | undefined): string | null {
  if (typeof httpStatus !== "number" || !Number.isFinite(httpStatus)) {
    return null;
  }

  let statusText = "";
  try {
    statusText = new Response(null, { status: httpStatus }).statusText.trim();
  } catch {
    statusText = "";
  }
  if (!statusText) {
    statusText = HTTP_STATUS_REASON_TEXT[httpStatus] || "";
  }

  const normalizedError = String(errorMessage || "").trim();
  const statusPrefix = statusText ? `${httpStatus} ${statusText}` : `${httpStatus}`;
  if (!normalizedError) return statusPrefix;
  return `${statusPrefix}: ${normalizedError}`;
}

const hasNostrExtension = (): boolean =>
  typeof window !== "undefined" && Boolean((window as WindowWithNostr).nostr);

function resolveBooleanEnvFlag(value: unknown, defaultValue: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function NostrAuthModal({ isOpen, onClose, initialStep }: NostrAuthModalProps) {
  const { t } = useTranslation();
  const { 
    loginWithExtension, 
    loginWithPrivateKey, 
    loginAsGuest,
    loginWithNostrConnect,
    loginWithNoas,
    signupWithNoas,
    isAuthenticating 
  } = useNDK();

  const noasApiUrl = import.meta.env.VITE_NOAS_API_URL as string | undefined;
  const noasHostUrl = import.meta.env.VITE_NOAS_HOST_URL as string | undefined;
  const allowGuestSignIn = resolveBooleanEnvFlag(import.meta.env.VITE_ALLOW_GUEST_SIGN_IN, true);
  const hasConfiguredNoasHost = Boolean(noasApiUrl || noasHostUrl);
  const resolvedDefaultStep = useMemo<AuthStep>(() => {
    if (initialStep === "noasSignUp") return "noasSignUp";
    if (initialStep === "noas") return "noas";
    if (initialStep === "choose") return "choose";
    return hasConfiguredNoasHost ? "noas" : "choose";
  }, [hasConfiguredNoasHost, initialStep]);
  const defaultNoasUrl = noasHostUrl || noasApiUrl || "";
  
  const [step, setStep] = useState<AuthStep>(resolvedDefaultStep);
  const [pendingAuthMethod, setPendingAuthMethod] = useState<PendingAuthMethod>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editableNoasUrl, setEditableNoasUrl] = useState(defaultNoasUrl);
  const [noasUsername, setNoasUsername] = useState("");
  const [noasPassword, setNoasPassword] = useState("");
  const [isEditingNoasHost, setIsEditingNoasHost] = useState(false);
  const hasUnsavedAuthInput = privateKey.trim().length > 0 || bunkerUrl.trim().length > 0;

  const hasExtension = hasNostrExtension();
  const isMobile = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  const handleExtensionLogin = async () => {
    setError(null);
    setPendingAuthMethod("extension");
    try {
      const success = await loginWithExtension();
      if (success) {
        toast.success(t("auth.modal.success.extension"));
        onClose();
      } else {
        setError(t("auth.modal.errors.extensionFailed"));
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handlePrivateKeyLogin = async () => {
    setError(null);
    if (!privateKey.trim()) {
      setError(t("auth.modal.errors.privateKeyRequired"));
      return;
    }

    setPendingAuthMethod("privateKey");
    try {
      const success = await loginWithPrivateKey(privateKey.trim());
      if (success) {
        toast.success(t("auth.modal.success.privateKey"));
        setPrivateKey("");
        onClose();
      } else {
        setError(t("auth.modal.errors.privateKeyInvalid"));
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setPendingAuthMethod("guest");
    try {
      const success = await loginAsGuest();
      if (success) {
        toast.success(t("auth.modal.success.guest"));
        onClose();
      } else {
        setError(t("auth.modal.errors.guestFailed"));
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleNostrConnectLogin = async () => {
    setError(null);
    if (!bunkerUrl.trim()) {
      setError(t("auth.modal.errors.signerRequired"));
      return;
    }
    setPendingAuthMethod("nostrConnect");
    try {
      const success = await loginWithNostrConnect(bunkerUrl.trim());
      if (success) {
        toast.success(t("auth.modal.success.signer"));
        setBunkerUrl("");
        onClose();
      } else {
        setError(t("auth.modal.errors.signerFailed"));
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleNoasLogin = async (
    username: string,
    password: string,
    config?: { baseUrl?: string }
  ) => {
    setError(null);
    setPendingAuthMethod("noas");
    try {
      const result = await loginWithNoas(username, password, config);
      if (result.success) {
        toast.success(t("auth.modal.success.noas"));
        onClose();
        return true;
      } else {
        const serverPayloadError = formatNoasServerErrorPayload(result.errorMessage, result.httpStatus);
        setError(serverPayloadError || resolveNoasErrorMessage(result.errorCode, t, "signIn"));
        return false;
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleNoasSignUp = async (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string }
  ) => {
    setError(null);
    setPendingAuthMethod("noas");
    try {
      const result = await signupWithNoas(username, password, privateKey, pubkey, config);
      if (result.success) {
        toast.success(t("auth.modal.success.noasSignUp"));
        onClose();
        return true;
      } else {
        const serverPayloadError = formatNoasServerErrorPayload(result.errorMessage, result.httpStatus);
        setError(serverPayloadError || resolveNoasErrorMessage(result.errorCode, t, "signUp"));
        return false;
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleClose = () => {
    setStep(resolvedDefaultStep);
    setPrivateKey("");
    setBunkerUrl("");
    setPendingAuthMethod(null);
    setError(null);
    setEditableNoasUrl(defaultNoasUrl);
    setNoasUsername("");
    setNoasPassword("");
    setIsEditingNoasHost(false);
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setStep(resolvedDefaultStep);
    }
  }, [isOpen, resolvedDefaultStep]);

  const shouldShowModalHeader = step !== "noas" && step !== "noasSignUp";
  const authMethodOptionClassName =
    "w-full flex items-center gap-2.5 rounded-md border p-3 text-left transition-colors sm:p-3.5";
  const authMethodOptionIconClassName =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="w-[calc(100%-1rem)] max-h-[calc(100dvh-1rem)] p-0 sm:max-w-xl"
        dismissOnOutsideInteract={!hasUnsavedAuthInput}
      >
        <div className="flex max-h-[calc(100dvh-1rem)] flex-col p-3 sm:p-4">
          {shouldShowModalHeader ? (
            <DialogHeader className="shrink-0">
              <DialogTitle>{t("auth.modal.title")}</DialogTitle>
              <DialogDescription>
                {step === "choose"
                  ? t("auth.modal.descriptionChoose")
                  : step === "privateKey"
                    ? t("auth.modal.descriptionPrivateKey")
                    : t("auth.modal.descriptionNostrConnect")
                }
              </DialogDescription>
            </DialogHeader>
          ) : (
            <DialogHeader className="sr-only">
              <DialogTitle>{t("auth.modal.title")}</DialogTitle>
              <DialogDescription>{t("auth.noas.description")}</DialogDescription>
            </DialogHeader>
          )}

          {error && step !== "noas" && step !== "noasSignUp" && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="scrollbar-thin mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
            {step === "choose" ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {/* Noas Authentication */}
                  <button
                    onClick={() => setStep("noas")}
                    disabled={isAuthenticating}
                    aria-busy={pendingAuthMethod === "noas"}
                    className={cn(authMethodOptionClassName, "border-border hover:bg-muted hover:border-primary/50 sm:col-span-2")}
                  >
                    <div className={cn(authMethodOptionIconClassName, "bg-blue-100")}>
                      <LogIn className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t("auth.modal.noasAuth")}</div>
                      <div className="text-xs text-muted-foreground sm:text-sm">
                        {t("auth.modal.noasAuthHint")}
                      </div>
                    </div>
                    {pendingAuthMethod === "noas" && <Loader2 className="h-4 w-4 animate-spin" />}
                  </button>

                  {/* Nostr Connect (Signer App) */}
                  <button
                    onClick={() => setStep("nostrConnect")}
                    disabled={isAuthenticating}
                    className={cn(authMethodOptionClassName, "border-border hover:bg-muted hover:border-primary/50")}
                  >
                    <div className={cn(authMethodOptionIconClassName, "bg-secondary")}>
                      <Smartphone className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t("auth.modal.signerApp")}</div>
                      <div className="text-xs text-muted-foreground sm:text-sm">
                        {t("auth.modal.signerAppHint")}
                      </div>
                    </div>
                  </button>

                  {/* Browser Extension */}
                  <button
                    onClick={handleExtensionLogin}
                    disabled={isAuthenticating || !hasExtension || isMobile}
                    aria-busy={pendingAuthMethod === "extension"}
                    className={cn(
                      authMethodOptionClassName,
                      hasExtension && !isMobile
                        ? "border-border hover:bg-muted hover:border-primary/50"
                        : "cursor-not-allowed border-border/50 opacity-50"
                    )}
                  >
                    <div className={cn(authMethodOptionIconClassName, "bg-primary/10")}>
                      <Zap className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t("auth.modal.browserExtension")}</div>
                      <div className="text-xs text-muted-foreground sm:text-sm">
                        {isMobile
                          ? t("auth.modal.extensionMobileUnavailable")
                          : hasExtension
                            ? t("auth.modal.extensionSignInHint")
                            : t("auth.modal.extensionMissing")
                        }
                      </div>
                    </div>
                    {pendingAuthMethod === "extension" && <Loader2 className="h-4 w-4 animate-spin" />}
                  </button>

                  {/* Guest Identity */}
                  {allowGuestSignIn ? (
                    <button
                      onClick={handleGuestLogin}
                      disabled={isAuthenticating}
                      aria-busy={pendingAuthMethod === "guest"}
                      className={cn(authMethodOptionClassName, "border-border hover:bg-muted hover:border-primary/50")}
                    >
                      <div className={cn(authMethodOptionIconClassName, "bg-secondary")}>
                        <User className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{t("auth.modal.guestIdentity")}</div>
                        <div className="text-xs text-muted-foreground sm:text-sm">
                          {t("auth.modal.guestIdentityHint")}
                        </div>
                      </div>
                      {pendingAuthMethod === "guest" && <Loader2 className="h-4 w-4 animate-spin" />}
                    </button>
                  ) : null}

                  {/* Private Key */}
                  <button
                    onClick={() => setStep("privateKey")}
                    disabled={isAuthenticating}
                    className={cn(authMethodOptionClassName, "border-border hover:bg-muted hover:border-primary/50")}
                  >
                    <div className={cn(authMethodOptionIconClassName, "bg-secondary")}>
                      <Key className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t("auth.modal.privateKey")}</div>
                      <div className="text-xs text-muted-foreground sm:text-sm">
                        {t("auth.modal.privateKeyHint")}
                      </div>
                    </div>
                  </button>
                </div>

                <p className="pt-1 text-center text-xs text-muted-foreground">
                  {t("auth.modal.securityHint")}
                </p>
              </div>
            ) : step === "privateKey" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="privateKey">{t("auth.modal.privateKey")}</Label>
              <Input
                id="privateKey"
                type="password"
                placeholder={t("auth.modal.privateKeyPlaceholder")}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t("auth.modal.privateKeyLocalOnly")}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("choose")}
                disabled={isAuthenticating}
                className="flex-1"
              >
                {t("auth.modal.back")}
              </Button>
              <Button
                onClick={handlePrivateKeyLogin}
                disabled={isAuthenticating || !privateKey.trim()}
                className="flex-1"
              >
                {pendingAuthMethod === "privateKey" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("auth.modal.signIn")}
              </Button>
            </div>
          </div>
        ) : step === "noas" ? (
          <NoasAuthForm
            onLogin={handleNoasLogin}
            onSignUp={() => setStep("noasSignUp")}
            onBack={() => setStep("choose")}
            username={noasUsername}
            password={noasPassword}
            isEditingHostUrl={isEditingNoasHost}
            allowDirectHostEdit={!hasConfiguredNoasHost}
            isLoading={isAuthenticating}
            error={error || undefined}
            noasHostUrl={editableNoasUrl}
            onUsernameChange={setNoasUsername}
            onPasswordChange={setNoasPassword}
            onNoasHostUrlChange={setEditableNoasUrl}
            onToggleHostEdit={() => setIsEditingNoasHost((current) => !current)}
          />
        ) : step === "noasSignUp" ? (
          <NoasSignUpForm
            onSignUp={handleNoasSignUp}
            onSignIn={() => setStep("noas")}
            username={noasUsername}
            password={noasPassword}
            isEditingHostUrl={isEditingNoasHost}
            allowDirectHostEdit={!hasConfiguredNoasHost}
            isLoading={isAuthenticating}
            error={error || undefined}
            noasHostUrl={editableNoasUrl}
            onUsernameChange={setNoasUsername}
            onPasswordChange={setNoasPassword}
            onNoasHostUrlChange={setEditableNoasUrl}
            onToggleHostEdit={() => setIsEditingNoasHost((current) => !current)}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bunkerUrl">{t("auth.modal.signerConnection")}</Label>
              <Input
                id="bunkerUrl"
                type="text"
                placeholder={t("auth.modal.signerPlaceholder")}
                value={bunkerUrl}
                onChange={(e) => setBunkerUrl(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t("auth.modal.signerHint")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("choose")}
                disabled={isAuthenticating}
                className="flex-1"
              >
                {t("auth.modal.back")}
              </Button>
              <Button
                onClick={handleNostrConnectLogin}
                disabled={isAuthenticating || !bunkerUrl.trim()}
                className="flex-1"
              >
                {pendingAuthMethod === "nostrConnect" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t("auth.modal.connect")}
              </Button>
            </div>
          </div>
        )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// User menu component for showing logged-in state
interface NostrUserMenuProps {
  onSignInClick: () => void;
}

const desktopTopbarControlClassName =
  "h-9 w-auto max-w-[14rem] rounded-md bg-transparent px-2 gap-2 justify-end whitespace-nowrap hover:bg-accent/60 hover:text-accent-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-accent-foreground focus-visible:ring-0 focus-visible:ring-offset-0 xl:h-10";

export function NostrUserMenu({ onSignInClick }: NostrUserMenuProps) {
  const { t } = useTranslation();
  const {
    user,
    authMethod,
    isConnected,
    logout,
    getGuestPrivateKey,
    needsProfileSetup,
    isProfileSyncing,
    updateUserProfile,
    publishEvent,
  } = useNDK();
  const [showKey, setShowKey] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [hasForcedProfileSetupOpen, setHasForcedProfileSetupOpen] = useState(false);
  const effectiveProfile = useMemo(
    () => resolveCurrentUserProfile(user?.pubkey, user?.profile),
    [user?.profile, user?.pubkey]
  );
  const {
    fields: {
      profileName,
      profileDisplayName,
      profilePicture,
      profileNip05,
      profileAbout,
      presencePublishingEnabled,
      publishDelayEnabled,
      autoCaptionEnabled,
    },
    isProfileDirty,
    isSavingProfile,
    validation: {
      showProfileNameRequired,
      showProfileNameInvalid,
      showProfileNameTaken,
      isProfileNameValid,
    },
    setProfileName,
    setProfileDisplayName,
    setProfilePicture,
    setProfileNip05,
    setProfileAbout,
    resetFromProfile,
    handleSaveProfile,
    handlePresencePublishingChange,
    handlePublishDelayChange,
    handleAutoCaptionChange,
  } = useProfileEditor({
    userPubkey: user?.pubkey,
    t,
    updateUserProfile,
    publishEvent,
    onSaved: () => setIsProfileEditorOpen(false),
  });

  const openProfileEditor = useCallback(() => {
    if (!isConnected) {
      toast.error(t("filters.profile.noRelayConnected"));
      return;
    }
    resetFromProfile(effectiveProfile);
    setIsProfileEditorOpen(true);
  }, [effectiveProfile, isConnected, resetFromProfile, t]);

  const handleCopyKey = () => {
    const hexKey = getGuestPrivateKey();
    if (hexKey) {
      try {
        const nsec = nip19.nsecEncode(hexKey as unknown as Uint8Array);
        navigator.clipboard.writeText(nsec);
        toast.success(t("auth.menu.copySuccessNsec"));
      } catch {
        // If nsec encoding fails, copy hex
        navigator.clipboard.writeText(hexKey);
        toast.success(t("auth.menu.copySuccessHex"));
      }
    }
  };

  const getDisplayKey = () => {
    const hexKey = getGuestPrivateKey();
    if (!hexKey) return "";
    try {
      return nip19.nsecEncode(hexKey as unknown as Uint8Array);
    } catch {
      return hexKey;
    }
  };

  useEffect(() => {
    if (!user || !needsProfileSetup) {
      setHasForcedProfileSetupOpen(false);
    }
  }, [user, needsProfileSetup]);

  useEffect(() => {
    if (
      user
      && isConnected
      && needsProfileSetup
      && !isProfileSyncing
      && !isProfileEditorOpen
      && !hasForcedProfileSetupOpen
    ) {
      setHasForcedProfileSetupOpen(true);
      openProfileEditor();
    }
  }, [user, isConnected, needsProfileSetup, isProfileSyncing, isProfileEditorOpen, hasForcedProfileSetupOpen, openProfileEditor]);

  const canDismissProfileEditor = !needsProfileSetup || hasForcedProfileSetupOpen;

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignInClick}
        className={cn(desktopTopbarControlClassName, "text-muted-foreground hover:text-accent-foreground")}
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden xl:inline">{t("auth.menu.signInToPost")}</span>
        <span className="xl:hidden">{t("auth.menu.signInShort")}</span>
      </Button>
    );
  }

  const displayName = effectiveProfile.displayName || effectiveProfile.name || formatUserFacingPubkey(user.npub);
  const profileTriggerHint = t("auth.menu.profileHint", {
    name: displayName,
    pubkey: toUserFacingPubkey(user.npub || user.pubkey),
  });
  const methodLabel = authMethod === "extension"
    ? t("filters.authMethod.extension")
    : authMethod === "guest"
      ? t("filters.authMethod.guest")
      : authMethod === "nostrConnect"
        ? t("filters.authMethod.signer")
        : authMethod === "noas"
          ? t("filters.authMethod.noas")
          : t("filters.authMethod.privateKey");

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (!open) setShowKey(false); }}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={desktopTopbarControlClassName}
            title={profileTriggerHint}
            aria-label={profileTriggerHint}
          >
            <UserAvatar id={user.pubkey} displayName={displayName} avatarUrl={effectiveProfile.picture} className="w-5 h-5" />
            <span className="text-sm font-medium truncate max-w-[8rem]">{displayName}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-2">
          <DropdownMenuLabel className="px-2 py-1">
            <div className="flex items-center gap-2">
              <UserAvatar id={user.pubkey} displayName={displayName} avatarUrl={effectiveProfile.picture} className="w-6 h-6" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium truncate">{displayName}</span>
                  {effectiveProfile.nip05Verified && (
                    <span className="flex items-center gap-1 text-xs text-success" title={`Verified: ${effectiveProfile.nip05}`}>
                      <BadgeCheck className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {effectiveProfile.nip05 && !effectiveProfile.nip05Verified && (
                    <span className="text-xs text-muted-foreground" title={effectiveProfile.nip05}>
                      ✓
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {authMethod === "guest"
                    ? t("auth.menu.signedInAs", { method: methodLabel })
                    : t("auth.menu.signedInVia", { method: methodLabel })}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              openProfileEditor();
            }}
          >
            <User className="w-4 h-4 mr-2" />
            {t("auth.menu.editProfile")}
          </DropdownMenuItem>
          <div className="px-2 py-2 space-y-2" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-medium text-muted-foreground">{t("auth.menu.appPreferences")}</p>
            <label htmlFor="menu-presence-enabled" className="flex items-start gap-2 rounded-md border border-border/70 px-2.5 py-2">
              <input
                id="menu-presence-enabled"
                type="checkbox"
                checked={presencePublishingEnabled}
                onChange={(event) => handlePresencePublishingChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-xs font-medium">{t("filters.profile.presenceTitle")}</span>
                <span className="block text-xs text-muted-foreground">{t("filters.profile.presenceDescription")}</span>
              </span>
            </label>
            <label htmlFor="menu-publish-delay-enabled" className="flex items-start gap-2 rounded-md border border-border/70 px-2.5 py-2">
              <input
                id="menu-publish-delay-enabled"
                type="checkbox"
                checked={publishDelayEnabled}
                onChange={(event) => handlePublishDelayChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-xs font-medium">{t("filters.profile.undoSendTitle")}</span>
                <span className="block text-xs text-muted-foreground">{t("filters.profile.undoSendDescription")}</span>
              </span>
            </label>
            <label htmlFor="menu-auto-caption-enabled" className="flex items-start gap-2 rounded-md border border-border/70 px-2.5 py-2">
              <input
                id="menu-auto-caption-enabled"
                type="checkbox"
                checked={autoCaptionEnabled}
                onChange={(event) => handleAutoCaptionChange(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="space-y-0.5">
                <span className="block text-xs font-medium">{t("filters.profile.autoCaptionTitle")}</span>
                <span className="block text-xs text-muted-foreground">{t("filters.profile.autoCaptionDescription")}</span>
              </span>
            </label>
          </div>
          {authMethod === "guest" && (
            <div className="px-2 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Key className="w-4 h-4 text-muted-foreground" />
                  {t("auth.menu.backupPrivateKey")}
                </span>
                <span className="text-xs text-warning">{t("auth.menu.keepSecret")}</span>
              </div>
              <div className="flex items-start gap-2">
                <code className="block min-w-0 flex-1 text-xs bg-muted p-2 rounded font-mono whitespace-nowrap overflow-x-auto">
                  {showKey ? getDisplayKey() : "••••••••••••••••••••••••••••••••"}
                </code>
                <div className="flex shrink-0 items-start gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowKey(!showKey)}
                    className="h-7 w-7 p-0"
                  >
                    {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyKey}
                    className="h-7 w-7 p-0"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("auth.menu.importKeyHint")}
              </p>
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              logout();
            }}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {t("auth.menu.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isProfileEditorOpen}
        onOpenChange={(open) => {
          if (!open && !canDismissProfileEditor) return;
          setIsProfileEditorOpen(open);
        }}
      >
        <DialogContent
          showCloseButton={canDismissProfileEditor}
          dismissOnOutsideInteract={canDismissProfileEditor && !isProfileDirty}
          className="w-[calc(100%-1rem)] max-h-[calc(100dvh-1rem)] p-0 sm:max-w-lg"
        >
          <div className="flex max-h-[calc(100dvh-1rem)] flex-col p-4 sm:p-6">
            <DialogHeader className="shrink-0">
              <DialogTitle>{needsProfileSetup ? t("auth.menu.profileSetupTitle") : t("auth.menu.profileEditTitle")}</DialogTitle>
              <DialogDescription>
                {t("auth.menu.profileDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="scrollbar-thin mt-3 min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-3 px-1">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-display-name">{t("filters.profile.displayName")}</Label>
                  <Input id="profile-display-name" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-name">{t("filters.profile.name")}</Label>
                  <Input
                    id="profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    aria-invalid={showProfileNameRequired || showProfileNameInvalid || showProfileNameTaken}
                    aria-describedby={showProfileNameRequired || showProfileNameInvalid || showProfileNameTaken ? "profile-name-error" : undefined}
                  />
                  {showProfileNameRequired && (
                    <p id="profile-name-error" className="text-xs text-destructive">
                      {t("filters.profile.nameRequired")}
                    </p>
                  )}
                  {!showProfileNameRequired && showProfileNameInvalid && (
                    <p id="profile-name-error" className="text-xs text-destructive">
                      {t("filters.profile.nameInvalidNip05")}
                    </p>
                  )}
                  {!showProfileNameRequired && !showProfileNameInvalid && showProfileNameTaken && (
                    <p id="profile-name-error" className="text-xs text-destructive">
                      {t("filters.profile.nameTaken")}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-picture">{t("filters.profile.picture")}</Label>
                  <Input id="profile-picture" value={profilePicture} onChange={(e) => setProfilePicture(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-nip05">{t("filters.profile.nip05")}</Label>
                  <Input id="profile-nip05" value={profileNip05} onChange={(e) => setProfileNip05(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-about">{t("filters.profile.about")}</Label>
                  <Textarea id="profile-about" value={profileAbout} onChange={(e) => setProfileAbout(e.target.value)} rows={4} />
                </div>
              </div>
            </div>
            <div className="mt-3 flex shrink-0 justify-end gap-2 bg-background/95 pt-2">
              {!needsProfileSetup && (
                <Button variant="outline" onClick={() => setIsProfileEditorOpen(false)} disabled={isSavingProfile}>
                  {t("filters.profile.cancel")}
                </Button>
              )}
              <Button onClick={handleSaveProfile} disabled={isSavingProfile || !isProfileNameValid}>
                {isSavingProfile ? t("filters.profile.saving") : t("filters.profile.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
