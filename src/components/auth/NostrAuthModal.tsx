import { useCallback, useEffect, useState } from "react";
import { Key, User, Zap, AlertCircle, Loader2, LogOut, BadgeCheck, Copy, Eye, EyeOff, ChevronDown } from "lucide-react";
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

interface NostrAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthStep = "choose" | "privateKey" | "nostrConnect";
type PendingAuthMethod = "extension" | "guest" | "privateKey" | "nostrConnect" | null;
type WindowWithNostr = Window & { nostr?: unknown };

const hasNostrExtension = (): boolean =>
  typeof window !== "undefined" && Boolean((window as WindowWithNostr).nostr);

export function NostrAuthModal({ isOpen, onClose }: NostrAuthModalProps) {
  const { 
    loginWithExtension, 
    loginWithPrivateKey, 
    loginAsGuest,
    loginWithNostrConnect,
    isAuthenticating 
  } = useNDK();
  
  const [step, setStep] = useState<AuthStep>("choose");
  const [pendingAuthMethod, setPendingAuthMethod] = useState<PendingAuthMethod>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasExtension = hasNostrExtension();
  const isMobile = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  const handleExtensionLogin = async () => {
    setError(null);
    setPendingAuthMethod("extension");
    try {
      const success = await loginWithExtension();
      if (success) {
        toast.success("Signed in with Nostr extension!");
        onClose();
      } else {
        setError("Failed to sign in with extension. Make sure you have a Nostr extension (like Alby or nos2x) installed.");
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handlePrivateKeyLogin = async () => {
    setError(null);
    if (!privateKey.trim()) {
      setError("Please enter your private key");
      return;
    }

    setPendingAuthMethod("privateKey");
    try {
      const success = await loginWithPrivateKey(privateKey.trim());
      if (success) {
        toast.success("Signed in with private key!");
        setPrivateKey("");
        onClose();
      } else {
        setError("Invalid private key. Please check and try again.");
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
        toast.success("Signed in as guest! A new identity was created for you.");
        onClose();
      } else {
        setError("Failed to create guest identity.");
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleNostrConnectLogin = async () => {
    setError(null);
    if (!bunkerUrl.trim()) {
      setError("Please paste a bunker:// connection string");
      return;
    }
    setPendingAuthMethod("nostrConnect");
    try {
      const success = await loginWithNostrConnect(bunkerUrl.trim());
      if (success) {
        toast.success("Connected to signer app!");
        setBunkerUrl("");
        onClose();
      } else {
        setError("Failed to connect. Verify your bunker:// string and try again.");
      }
    } finally {
      setPendingAuthMethod(null);
    }
  };

  const handleClose = () => {
    setStep("choose");
    setPrivateKey("");
    setBunkerUrl("");
    setPendingAuthMethod(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to Nostr</DialogTitle>
          <DialogDescription>
            {step === "choose"
              ? "Choose how you want to authenticate to post to Nostr relays."
              : step === "privateKey"
                ? "Enter your Nostr private key (nsec or hex format)."
                : "Connect with a signer app using Nostr Connect (NIP-46)."
            }
          </DialogDescription>
        </DialogHeader>

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
                <div className="font-medium">Browser Extension</div>
                <div className="text-sm text-muted-foreground">
                  {isMobile
                    ? "Extensions aren’t available on mobile"
                    : hasExtension 
                      ? "Sign in with Alby, nos2x, or another NIP-07 extension"
                      : "No Nostr extension detected"
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
                <div className="font-medium">Signer App (Nostr Connect)</div>
                <div className="text-sm text-muted-foreground">
                  Connect with a mobile signer using a bunker:// link
                </div>
              </div>
            </button>

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
                <div className="font-medium">Private Key</div>
                <div className="text-sm text-muted-foreground">
                  Enter your nsec or hex private key
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
                <div className="font-medium">Guest Identity</div>
                <div className="text-sm text-muted-foreground">
                  Generate a temporary identity to try posting
                </div>
              </div>
              {pendingAuthMethod === "guest" && (
                <Loader2 data-testid="auth-loader-guest" className="w-4 h-4 animate-spin" />
              )}
            </button>

            <p className="text-xs text-muted-foreground text-center pt-2">
              Your keys never leave your device or signer app. Signing happens locally or in your signer.
            </p>
          </div>
        ) : step === "privateKey" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="privateKey">Private Key</Label>
              <Input
                id="privateKey"
                type="password"
                placeholder="nsec1... or hex key"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Your key is only used locally and never sent to any server.
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("choose")}
                disabled={isAuthenticating}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handlePrivateKeyLogin}
                disabled={isAuthenticating || !privateKey.trim()}
                className="flex-1"
              >
                {pendingAuthMethod === "privateKey" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Sign In
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bunkerUrl">Signer Connection</Label>
              <Input
                id="bunkerUrl"
                type="text"
                placeholder="bunker://..."
                value={bunkerUrl}
                onChange={(e) => setBunkerUrl(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Paste the bunker:// link from your signer app to connect.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("choose")}
                disabled={isAuthenticating}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleNostrConnectLogin}
                disabled={isAuthenticating || !bunkerUrl.trim()}
                className="flex-1"
              >
                {pendingAuthMethod === "nostrConnect" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Connect
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
  const {
    user,
    authMethod,
    logout,
    getGuestPrivateKey,
    needsProfileSetup,
    isProfileSyncing,
    updateUserProfile,
  } = useNDK();
  const [showKey, setShowKey] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [profileNip05, setProfileNip05] = useState("");
  const [profileAbout, setProfileAbout] = useState("");

  const openProfileEditor = useCallback(() => {
    setProfileName(user?.profile?.name || "");
    setProfileDisplayName(user?.profile?.displayName || "");
    setProfilePicture(user?.profile?.picture || "");
    setProfileNip05(user?.profile?.nip05 || "");
    setProfileAbout(user?.profile?.about || "");
    setIsProfileEditorOpen(true);
  }, [user?.profile?.about, user?.profile?.displayName, user?.profile?.name, user?.profile?.nip05, user?.profile?.picture]);

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      toast.error("Profile name is required");
      return;
    }

    setIsSavingProfile(true);
    try {
      const success = await updateUserProfile({
        name: profileName,
        displayName: profileDisplayName || undefined,
        picture: profilePicture || undefined,
        nip05: profileNip05 || undefined,
        about: profileAbout || undefined,
      });
      if (success) {
        toast.success("Profile updated on connected relays");
        setIsProfileEditorOpen(false);
      } else {
        toast.error("Failed to update profile. Check relay connectivity and try again.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCopyKey = () => {
    const hexKey = getGuestPrivateKey();
    if (hexKey) {
      try {
        const nsec = nip19.nsecEncode(hexKey as unknown as Uint8Array);
        navigator.clipboard.writeText(nsec);
        toast.success("Private key copied to clipboard!");
      } catch {
        // If nsec encoding fails, copy hex
        navigator.clipboard.writeText(hexKey);
        toast.success("Private key (hex) copied to clipboard!");
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
    if (user && needsProfileSetup && !isProfileSyncing && !isProfileEditorOpen) {
      openProfileEditor();
    }
  }, [user, needsProfileSetup, isProfileSyncing, isProfileEditorOpen, openProfileEditor]);

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onSignInClick}
        className="h-full px-2 gap-2 text-muted-foreground hover:text-foreground bg-transparent hover:bg-transparent rounded-none"
      >
        <Zap className="w-4 h-4" />
        Sign in to post
      </Button>
    );
  }

  const displayName = user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`;
  const methodLabel = authMethod === "extension"
    ? "Extension"
    : authMethod === "guest"
      ? "Guest"
      : authMethod === "nostrConnect"
        ? "Signer"
        : "Key";

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (!open) setShowKey(false); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-full w-full px-2 gap-2 bg-transparent hover:bg-transparent rounded-none justify-end">
            <UserAvatar id={user.pubkey} displayName={displayName} avatarUrl={user.profile?.picture} className="w-5 h-5" />
            <span className="text-sm font-medium truncate max-w-[8rem]">{displayName}</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-2">
          <DropdownMenuLabel className="px-2 py-1">
            <div className="flex items-center gap-2">
              <UserAvatar id={user.pubkey} displayName={displayName} avatarUrl={user.profile?.picture} className="w-6 h-6" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium truncate">{displayName}</span>
                  {user.profile?.nip05Verified && (
                    <span className="flex items-center gap-1 text-xs text-success" title={`Verified: ${user.profile.nip05}`}>
                      <BadgeCheck className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {user.profile?.nip05 && !user.profile?.nip05Verified && (
                    <span className="text-xs text-muted-foreground" title={user.profile.nip05}>
                      ✓
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">Signed in via {methodLabel}</span>
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
            Edit profile
          </DropdownMenuItem>
          {authMethod === "guest" && (
            <div className="px-2 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Key className="w-4 h-4 text-muted-foreground" />
                  Backup Private Key
                </span>
                <span className="text-xs text-warning">Keep secret</span>
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
                Import this key in other Nostr clients to access this identity.
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
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isProfileEditorOpen}
        onOpenChange={(open) => {
          if (!open && needsProfileSetup) return;
          setIsProfileEditorOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100%-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle>{needsProfileSetup ? "Set up your profile" : "Edit profile"}</DialogTitle>
            <DialogDescription>
              Your Nostr metadata (`kind:0`) will be published to connected relays. Name is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name *</Label>
              <Input id="profile-name" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-display-name">Display name</Label>
              <Input id="profile-display-name" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-picture">Picture URL</Label>
              <Input id="profile-picture" value={profilePicture} onChange={(e) => setProfilePicture(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-nip05">NIP-05</Label>
              <Input id="profile-nip05" value={profileNip05} onChange={(e) => setProfileNip05(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-about">About</Label>
              <Textarea id="profile-about" value={profileAbout} onChange={(e) => setProfileAbout(e.target.value)} rows={4} />
            </div>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 bg-background/95 pt-2">
            {!needsProfileSetup && (
              <Button variant="outline" onClick={() => setIsProfileEditorOpen(false)} disabled={isSavingProfile}>
                Cancel
              </Button>
            )}
            <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
              {isSavingProfile ? "Saving..." : "Save profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
