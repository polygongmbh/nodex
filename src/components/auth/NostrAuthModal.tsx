import { useCallback, useEffect, useMemo, useState } from "react";
import { Key, User, Zap, AlertCircle, Loader2, LogOut, BadgeCheck, Copy, Eye, EyeOff, ChevronDown, LogIn } from "lucide-react";
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
import { useNDK } from "@/lib/nostr/ndk-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nip19 } from "nostr-tools";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useTranslation } from "react-i18next";
import { resolveCurrentUserProfile } from "@/lib/current-user-profile-cache";
import { useProfileEditor } from "@/hooks/use-profile-editor";
import { NoasAuthForm } from "./NoasAuthForm";
import { NoasSignUpForm } from "./NoasSignUpForm";

interface NostrAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: "choose" | "noas" | "noasSignUp";
}

type AuthStep = "choose" | "privateKey" | "nostrConnect" | "noas" | "noasSignUp";
type PendingAuthMethod = "extension" | "guest" | "privateKey" | "nostrConnect" | "noas" | null;
type WindowWithNostr = Window & { nostr?: unknown };

const hasNostrExtension = (): boolean =>
  typeof window !== "undefined" && Boolean((window as WindowWithNostr).nostr);

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
  const noasEnabled = Boolean(noasApiUrl || noasHostUrl);
  const resolvedDefaultStep = useMemo<AuthStep>(() => {
    if (initialStep === "noasSignUp" && noasEnabled) return "noasSignUp";
    if (initialStep === "noas" && noasEnabled) return "noas";
    if (initialStep === "choose") return "choose";
    return noasEnabled ? "noas" : "choose";
  }, [initialStep, noasEnabled]);
  const defaultNoasUrl = noasHostUrl || noasApiUrl || "https://noas.example.com";
  
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
      const success = await loginWithNoas(username, password, config);
      if (success) {
        toast.success(t("auth.modal.success.noas") || "Signed in with Noas");
        onClose();
        return true;
      } else {
        setError(t("auth.modal.errors.noasFailed") || "Noas sign-in failed");
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
      const success = await signupWithNoas(username, password, privateKey, pubkey, config);
      if (success) {
        toast.success(t("auth.modal.success.noasSignUp") || "Account created successfully");
        onClose();
        return true;
      } else {
        setError(t("auth.modal.errors.noasSignUpFailed") || "Sign up failed");
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
    if (!isOpen) {
      setStep(resolvedDefaultStep);
    }
  }, [isOpen, resolvedDefaultStep]);

  const shouldShowModalHeader = step !== "noas" && step !== "noasSignUp";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" dismissOnOutsideInteract={!hasUnsavedAuthInput}>
        {shouldShowModalHeader ? (
          <DialogHeader>
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
            <DialogDescription>{t("auth.noas.description") || "Noas authentication"}</DialogDescription>
          </DialogHeader>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === "choose" ? (
          <div className="space-y-3">
            {/* Browser Extension */}
            <button
              onClick={handleExtensionLogin}
              disabled={isAuthenticating || !hasExtension || isMobile}
              className={cn(
                "w-full flex items-center gap-3 p-4 rounded-lg border transition-colors text-left",
                hasExtension && !isMobile
                  ? "border-border hover:bg-muted hover:border-primary/50" 
                  : "border-border/50 opacity-50 cursor-not-allowed"
              )}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{t("auth.modal.browserExtension")}</div>
                <div className="text-sm text-muted-foreground">
                  {isMobile
                    ? t("auth.modal.extensionMobileUnavailable")
                    : hasExtension 
                      ? t("auth.modal.extensionSignInHint")
                      : t("auth.modal.extensionMissing")
                  }
                </div>
              </div>
              {pendingAuthMethod === "extension" && (
                <Loader2 data-testid="auth-loader-extension" className="w-4 h-4 animate-spin" />
              )}
            </button>

            {/* Nostr Connect (Signer App) */}
            <button
              onClick={() => setStep("nostrConnect")}
              disabled={isAuthenticating}
              className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted hover:border-primary/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <Key className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{t("auth.modal.signerApp")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("auth.modal.signerAppHint")}
                </div>
              </div>
            </button>

            {/* Noas Authentication */}
            {noasEnabled && (
              <button
                onClick={() => setStep("noas")}
                disabled={isAuthenticating}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted hover:border-primary/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <LogIn className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{t("auth.modal.noasAuth") || "Noas Authentication"}</div>
                  <div className="text-sm text-muted-foreground">
                    {t("auth.modal.noasAuthHint") || "Sign in with username and password"}
                  </div>
                </div>
                {pendingAuthMethod === "noas" && (
                  <Loader2 data-testid="auth-loader-noas" className="w-4 h-4 animate-spin" />
                )}
              </button>
            )}

            {/* Private Key */}
            <button
              onClick={() => setStep("privateKey")}
              disabled={isAuthenticating}
              className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted hover:border-primary/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{t("auth.modal.privateKey")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("auth.modal.privateKeyHint")}
                </div>
              </div>
            </button>

            {/* Guest Identity */}
            <button
              onClick={handleGuestLogin}
              disabled={isAuthenticating}
              className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:bg-muted hover:border-primary/50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                <User className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{t("auth.modal.guestIdentity")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("auth.modal.guestIdentityHint")}
                </div>
              </div>
              {pendingAuthMethod === "guest" && (
                <Loader2 data-testid="auth-loader-guest" className="w-4 h-4 animate-spin" />
              )}
            </button>

            <p className="text-xs text-muted-foreground text-center pt-2">
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
            onBack={noasEnabled ? () => setStep("choose") : undefined}
            username={noasUsername}
            password={noasPassword}
            isEditingHostUrl={isEditingNoasHost}
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
            onBack={noasEnabled ? () => setStep("choose") : undefined}
            username={noasUsername}
            password={noasPassword}
            isEditingHostUrl={isEditingNoasHost}
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
      </DialogContent>
    </Dialog>
  );
}

// User menu component for showing logged-in state
interface NostrUserMenuProps {
  onSignInClick: () => void;
}

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
        className="h-full px-2 gap-2 text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent rounded-none whitespace-nowrap"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden xl:inline">{t("auth.menu.signInToPost")}</span>
        <span className="xl:hidden">{t("auth.menu.signInShort")}</span>
      </Button>
    );
  }

  const displayName = effectiveProfile.displayName || effectiveProfile.name || `${user.npub.slice(0, 8)}...`;
  const profileTriggerHint = t("auth.menu.profileHint", {
    name: displayName,
    pubkey: user.pubkey,
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
            className="h-9 w-auto max-w-[14rem] px-2 gap-2 bg-transparent hover:bg-accent/60 hover:text-accent-foreground data-[state=open]:bg-accent/60 data-[state=open]:text-accent-foreground rounded-md justify-end focus-visible:ring-0 focus-visible:ring-offset-0"
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
                <code className="block max-w-[10rem] w-full text-xs bg-muted p-2 rounded font-mono whitespace-nowrap overflow-x-auto">
                  {showKey ? getDisplayKey() : "••••••••••••••••••••••••••••••••"}
                </code>
                <div className="flex flex-col gap-1">
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
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="space-y-3">
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
                  <Label htmlFor="profile-display-name">{t("filters.profile.displayName")}</Label>
                  <Input id="profile-display-name" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
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
            <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border/60 bg-background/95 pt-3">
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
