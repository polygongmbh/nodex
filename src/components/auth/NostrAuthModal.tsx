import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Key, User, Zap, AlertCircle, Loader2, LogOut, LogIn, Link2, CircleHelp, Pencil, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nip19 } from "nostr-tools";
import { useNavigate } from "react-router-dom";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "react-i18next";
import { formatUserFacingPubkey, toUserFacingPubkey } from "@/lib/nostr/user-facing-pubkey";
import { getAppPreferenceDefinitions } from "@/lib/app-preferences";
import { useProfileEditor } from "@/hooks/use-profile-editor";
import { DropdownTriggerContent } from "@/components/ui/dropdown-trigger-content";
import { GuestPrivateKeyRow } from "./GuestPrivateKeyRow";
import { NoasAuthForm } from "./NoasAuthForm";
import { NoasSignUpForm } from "./NoasSignUpForm";
import { ProfileEditorFields } from "./ProfileEditorFields";
import type { NoasAuthErrorCode } from "@/lib/nostr/noas-client";
import { resolveNoasHostDisplayValue } from "./noas-form-helpers";
import { buildAuthRoute } from "@/lib/auth-routes";

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
    case "key_mismatch":
      return t("auth.modal.errors.noasKeyMismatch");
    case "server_error":
    case "decryption_failed":
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
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const {
    loginWithExtension,
    loginWithPrivateKey,
    loginAsGuest,
    loginWithNostrConnect,
    loginWithNoas,
    signupWithNoas,
    isAuthenticating,
    defaultNoasHostUrl,
  } = useNDK();

  const noasHostUrl = import.meta.env.VITE_NOAS_HOST_URL as string | undefined;
  const allowGuestSignIn = resolveBooleanEnvFlag(import.meta.env.VITE_ALLOW_GUEST_SIGN_IN, true);
  const hasConfiguredNoasHost = Boolean(noasHostUrl || defaultNoasHostUrl);
  const resolvedDefaultStep = useMemo<AuthStep>(() => {
    if (initialStep === "noasSignUp") return "noasSignUp";
    if (initialStep === "noas") return "noas";
    if (initialStep === "choose") return "choose";
    return hasConfiguredNoasHost ? "noas" : "choose";
  }, [hasConfiguredNoasHost, initialStep]);
  const defaultNoasUrl = resolveNoasHostDisplayValue(defaultNoasHostUrl || noasHostUrl || "");
  
  const [step, setStep] = useState<AuthStep>(resolvedDefaultStep);
  const [pendingAuthMethod, setPendingAuthMethod] = useState<PendingAuthMethod>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editableNoasUrl, setEditableNoasUrl] = useState(defaultNoasUrl);
  const [noasUsername, setNoasUsername] = useState("");
  const [noasPassword, setNoasPassword] = useState("");
  const [isEditingNoasHost, setIsEditingNoasHost] = useState(false);
  const [showPrivateKeyInput, setShowPrivateKeyInput] = useState(false);
  const hasUnsavedAuthInput = privateKey.trim().length > 0 || bunkerUrl.trim().length > 0;
  const previousDefaultNoasUrlRef = useRef(defaultNoasUrl);

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
        setShowPrivateKeyInput(false);
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
      if (result.message) {
        toast.success(result.message);
      }
      if (result.success) {
        onClose();
        return true;
      }

      if (result.registrationSucceeded) {
        setError(result.message || null);
        setStep("noas");
        return false;
      }

      const serverPayloadError = formatNoasServerErrorPayload(result.errorMessage, result.httpStatus);
      setError(serverPayloadError || resolveNoasErrorMessage(result.errorCode, t, "signUp"));
      return false;
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleClose = () => {
    setStep(resolvedDefaultStep);
    setPrivateKey("");
    setShowPrivateKeyInput(false);
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

  useEffect(() => {
    const previousDefaultNoasUrl = previousDefaultNoasUrlRef.current;
    previousDefaultNoasUrlRef.current = defaultNoasUrl;

    if (!defaultNoasUrl || isEditingNoasHost) {
      return;
    }

    setEditableNoasUrl((currentEditableNoasUrl) => {
      if (!currentEditableNoasUrl || currentEditableNoasUrl === previousDefaultNoasUrl) {
        return defaultNoasUrl;
      }
      return currentEditableNoasUrl;
    });
  }, [defaultNoasUrl, isEditingNoasHost]);

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

          <DialogScrollBody className="mt-2">
            {step === "choose" ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {/* Noas Authentication */}
                  <button
                    onClick={() => setStep("noas")}
                    disabled={isAuthenticating}
                    aria-busy={pendingAuthMethod === "noas"}
                    className={cn(
                      authMethodOptionClassName,
                      "border-border p-4 hover:bg-muted hover:border-primary/50 sm:col-span-2 sm:p-4"
                    )}
                  >
                    <div className={cn(authMethodOptionIconClassName, "h-10 w-10 bg-blue-100 sm:h-11 sm:w-11")}>
                      <LogIn className="h-5 w-5 text-blue-600 sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t("auth.modal.noasAuth")}</div>
                      <div className="text-xs text-muted-foreground sm:text-sm">
                        {t("auth.modal.noasAuthHint")}
                      </div>
                    </div>
                    {pendingAuthMethod === "noas" && <Loader2 className="h-4 w-4 animate-spin" />}
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

                  {/* Nostr Connect (Signer App) */}
                  <button
                    onClick={() => setStep("nostrConnect")}
                    disabled={isAuthenticating}
                    className={cn(authMethodOptionClassName, "border-border hover:bg-muted hover:border-primary/50")}
                  >
                    <div className={cn(authMethodOptionIconClassName, "bg-secondary")}>
                      <Link2 className="h-4 w-4 text-muted-foreground sm:h-5 sm:w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{t("auth.modal.signerApp")}</div>
                      <div className="text-xs text-muted-foreground sm:text-sm">
                        {t("auth.modal.signerAppHint")}
                      </div>
                    </div>
                  </button>

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
                </div>

                <p className="pt-1 text-center text-xs text-muted-foreground">
                  {t("auth.modal.securityHint")}
                </p>
              </div>
            ) : step === "privateKey" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="privateKey">{t("auth.modal.privateKey")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="privateKey"
                      name="nostrPrivateKey"
                      type="text"
                      placeholder={t("auth.modal.privateKeyPlaceholder")}
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      style={{ WebkitTextSecurity: showPrivateKeyInput ? "none" : "disc" } as React.CSSProperties}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPrivateKeyInput((current) => !current)}
                      aria-label={
                        showPrivateKeyInput
                          ? t("auth.profile.hidePrivateKey")
                          : t("auth.profile.showPrivateKey")
                      }
                      title={
                        showPrivateKeyInput
                          ? t("auth.profile.hidePrivateKey")
                          : t("auth.profile.showPrivateKey")
                      }
                    >
                      {showPrivateKeyInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
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
                onSignUp={() => navigate(buildAuthRoute("noasSignUp"))}
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
                onSignIn={() => navigate(buildAuthRoute("noas"))}
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
          </DialogScrollBody>
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
  "h-9 w-auto max-w-[14rem] rounded-md bg-transparent px-2 gap-2 justify-end whitespace-nowrap hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0 xl:h-10";

export function NostrUserMenu({ onSignInClick }: NostrUserMenuProps) {
  const { t } = useTranslation("auth");
  const {
    user,
    authMethod,
    isConnected,
    hasWritableRelayConnection,
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
  const effectiveProfile = useMemo(() => user?.profile ?? {}, [user?.profile]);
  const {
    fields,
    fieldActions,
    isProfileDirty,
    isSavingProfile,
    validation,
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
  const { presencePublishingEnabled, publishDelayEnabled, autoCaptionEnabled } = fields;
  const { isUsernameValid } = validation;

  const openProfileEditor = useCallback(() => {
    if (!hasWritableRelayConnection) {
      toast.error(t("auth.profile.noRelayConnected"));
      return;
    }
    resetFromProfile(effectiveProfile);
    setIsProfileEditorOpen(true);
  }, [effectiveProfile, hasWritableRelayConnection, resetFromProfile, t]);

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
      && hasWritableRelayConnection
      && needsProfileSetup
      && !isProfileSyncing
      && !isProfileEditorOpen
      && !hasForcedProfileSetupOpen
    ) {
      setHasForcedProfileSetupOpen(true);
      openProfileEditor();
    }
  }, [
    user,
    hasWritableRelayConnection,
    needsProfileSetup,
    isProfileSyncing,
    isProfileEditorOpen,
    hasForcedProfileSetupOpen,
    openProfileEditor,
  ]);

  const canDismissProfileEditor = !needsProfileSetup || hasForcedProfileSetupOpen;

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignInClick}
        className={cn(desktopTopbarControlClassName, "text-muted-foreground")}
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
    ? t("auth.authMethod.extension")
    : authMethod === "guest"
      ? t("auth.authMethod.guest")
      : authMethod === "nostrConnect"
        ? t("auth.authMethod.signer")
        : authMethod === "noas"
          ? t("auth.authMethod.noas")
          : t("auth.authMethod.privateKey");
  const preferenceState = {
    presence: {
      checked: presencePublishingEnabled,
      onChange: handlePresencePublishingChange,
    },
    undoSend: {
      checked: publishDelayEnabled,
      onChange: handlePublishDelayChange,
    },
    autoCaption: {
      checked: autoCaptionEnabled,
      onChange: handleAutoCaptionChange,
    },
  } as const;
  const appPreferenceRows = getAppPreferenceDefinitions("desktop").map((preference) => ({
    id: `menu-${preference.id}`,
    checked: preferenceState[preference.key].checked,
    onChange: preferenceState[preference.key].onChange,
    label: t(preference.labelKey),
    description: t(preference.descriptionKey),
  }));

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (!open) setShowKey(false); }}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(desktopTopbarControlClassName, "xl:px-3")}
            title={profileTriggerHint}
            aria-label={profileTriggerHint}
          >
            <DropdownTriggerContent
              className="max-w-full"
              leading={
                <UserAvatar id={user.pubkey} displayName={displayName} avatarUrl={effectiveProfile.picture} className="w-5 h-5" />
              }
              label={displayName}
              labelClassName="max-w-[8rem] text-sm font-medium"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[21rem] p-2">
          <TooltipProvider delayDuration={200}>
            <DropdownMenuLabel className="px-2 py-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <UserAvatar id={user.pubkey} displayName={displayName} avatarUrl={effectiveProfile.picture} className="w-6 h-6" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium truncate">{displayName}</span>
                      {effectiveProfile.nip05 && (
                        <span className="text-xs text-muted-foreground truncate" title={effectiveProfile.nip05}>
                          {effectiveProfile.nip05}
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      aria-label={t("auth.menu.editProfile")}
                      aria-disabled={!hasWritableRelayConnection}
                      data-disabled={!hasWritableRelayConnection ? "" : undefined}
                      className={cn(
                        "h-8 w-8 shrink-0 justify-center rounded-md border border-border/70 p-0 text-muted-foreground",
                        !hasWritableRelayConnection && "pointer-events-none opacity-50"
                      )}
                      onSelect={(event) => {
                        event.preventDefault();
                        if (!hasWritableRelayConnection) return;
                        openProfileEditor();
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">{t("auth.menu.editProfile")}</span>
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left" align="center" className="text-xs">
                    {hasWritableRelayConnection
                      ? t("auth.menu.editProfile")
                      : t("auth.profile.noRelayConnected")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="space-y-1 px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
              <p className="text-[11px] font-medium text-muted-foreground">{t("auth.menu.appPreferences")}</p>
              {appPreferenceRows.map((preference) => (
                <div key={preference.id} className="flex items-center gap-1.5 rounded-sm px-1 py-1">
                  <input
                    id={preference.id}
                    type="checkbox"
                    checked={preference.checked}
                    onChange={(event) => preference.onChange(event.target.checked)}
                    className="h-3.5 w-3.5 shrink-0 accent-primary"
                  />
                  <label htmlFor={preference.id} className="min-w-0 flex-1 text-xs font-medium leading-tight">
                    {preference.label}
                  </label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("auth.menu.preferenceHelp", { setting: preference.label })}
                        onClick={(event) => event.preventDefault()}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                        <CircleHelp className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" align="center" className="max-w-[18rem] text-xs leading-relaxed">
                      {preference.description}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          </TooltipProvider>
          {authMethod === "guest" && (
            <div className="px-2 py-2">
              <GuestPrivateKeyRow
                value={getDisplayKey()}
                showKey={showKey}
                onToggleShow={() => setShowKey((prev) => !prev)}
                onCopy={handleCopyKey}
              />
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
            <DialogScrollBody className="mt-3">
              <ProfileEditorFields
                fields={fields}
                validation={validation}
                fieldActions={fieldActions}
                t={t}
              />
            </DialogScrollBody>
            <div className="mt-3 flex shrink-0 justify-end gap-2 bg-background/95 pt-2">
              {!needsProfileSetup && (
                <Button variant="outline" onClick={() => setIsProfileEditorOpen(false)} disabled={isSavingProfile}>
                  {t("auth.profile.cancel")}
                </Button>
              )}
              <Button onClick={handleSaveProfile} disabled={isSavingProfile || !isUsernameValid}>
                {isSavingProfile ? t("auth.profile.saving") : t("auth.profile.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
