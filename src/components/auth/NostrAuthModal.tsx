import { useState } from "react";
import { Key, User, Zap, AlertCircle, Loader2, LogOut, BadgeCheck, Copy, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNDK } from "@/lib/nostr/ndk-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nip19 } from "nostr-tools";

interface NostrAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthStep = "choose" | "privateKey";

export function NostrAuthModal({ isOpen, onClose }: NostrAuthModalProps) {
  const { 
    loginWithExtension, 
    loginWithPrivateKey, 
    loginAsGuest,
    isAuthenticating 
  } = useNDK();
  
  const [step, setStep] = useState<AuthStep>("choose");
  const [privateKey, setPrivateKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasExtension = typeof window !== "undefined" && (window as any).nostr;

  const handleExtensionLogin = async () => {
    setError(null);
    const success = await loginWithExtension();
    if (success) {
      toast.success("Signed in with Nostr extension!");
      onClose();
    } else {
      setError("Failed to sign in with extension. Make sure you have a Nostr extension (like Alby or nos2x) installed.");
    }
  };

  const handlePrivateKeyLogin = async () => {
    setError(null);
    if (!privateKey.trim()) {
      setError("Please enter your private key");
      return;
    }
    
    const success = await loginWithPrivateKey(privateKey.trim());
    if (success) {
      toast.success("Signed in with private key!");
      setPrivateKey("");
      onClose();
    } else {
      setError("Invalid private key. Please check and try again.");
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    const success = await loginAsGuest();
    if (success) {
      toast.success("Signed in as guest! A new identity was created for you.");
      onClose();
    } else {
      setError("Failed to create guest identity.");
    }
  };

  const handleClose = () => {
    setStep("choose");
    setPrivateKey("");
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
              : "Enter your Nostr private key (nsec or hex format)."
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
              disabled={isAuthenticating || !hasExtension}
              className={cn(
                "w-full flex items-center gap-3 p-4 rounded-lg border transition-colors text-left",
                hasExtension 
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
                  {hasExtension 
                    ? "Sign in with Alby, nos2x, or another NIP-07 extension"
                    : "No Nostr extension detected"
                  }
                </div>
              </div>
              {isAuthenticating && <Loader2 className="w-4 h-4 animate-spin" />}
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
              {isAuthenticating && <Loader2 className="w-4 h-4 animate-spin" />}
            </button>

            <p className="text-xs text-muted-foreground text-center pt-2">
              Your identity is never sent to any server. All signing happens locally.
            </p>
          </div>
        ) : (
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
                {isAuthenticating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Sign In
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
  const { user, authMethod, logout, getGuestPrivateKey } = useNDK();
  const [showKeyExport, setShowKeyExport] = useState(false);
  const [showKey, setShowKey] = useState(false);

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

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onSignInClick}
        className="gap-2"
      >
        <Zap className="w-4 h-4" />
        Sign in to post
      </Button>
    );
  }

  const displayName = user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`;
  const methodLabel = authMethod === "extension" ? "Extension" : authMethod === "guest" ? "Guest" : "Key";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
          {user.profile?.picture ? (
            <img 
              src={user.profile.picture} 
              alt="" 
              className="w-5 h-5 rounded-full"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-3 h-3 text-primary" />
            </div>
          )}
          <span className="text-sm font-medium">{displayName}</span>
          {user.profile?.nip05Verified && (
            <span className="flex items-center gap-1 text-xs text-success" title={`Verified: ${user.profile.nip05}`}>
              <BadgeCheck className="w-3.5 h-3.5" />
            </span>
          )}
          <span className="text-xs text-muted-foreground">({methodLabel})</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="h-8 w-8 p-0"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
      
      {/* NIP-05 display */}
      {user.profile?.nip05 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
          {user.profile.nip05Verified ? (
            <BadgeCheck className="w-3.5 h-3.5 text-success" />
          ) : (
            <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/50" />
          )}
          <span className={cn(user.profile.nip05Verified && "text-foreground")}>
            {user.profile.nip05}
          </span>
        </div>
      )}
      
      {/* Guest key export */}
      {authMethod === "guest" && (
        <div className="mt-1">
          {!showKeyExport ? (
            <button
              onClick={() => setShowKeyExport(true)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Key className="w-3 h-3" />
              Backup your private key
            </button>
          ) : (
            <div className="p-2 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-warning">⚠️ Keep this secret!</span>
                <button
                  onClick={() => setShowKeyExport(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Hide
                </button>
              </div>
              <div className="flex items-center gap-1">
                <code className="flex-1 text-xs bg-background p-1.5 rounded font-mono break-all">
                  {showKey ? getDisplayKey() : "••••••••••••••••••••••••••••••••"}
                </code>
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
              <p className="text-xs text-muted-foreground">
                Import this key in other Nostr clients to access this identity.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
