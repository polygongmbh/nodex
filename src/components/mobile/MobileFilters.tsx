import { useMemo, useState } from "react";
import { Radio, Hash, Users, Check, X, Minus, Plus, User, LogOut, Key, Copy, Eye, EyeOff, Sparkles, LogIn, Trash2, Building2, Gamepad2, Cpu, PlayCircle } from "lucide-react";
import { Relay, Channel, Person } from "@/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useNDK } from "@/lib/nostr/ndk-context";
import { toast } from "sonner";

interface MobileFiltersProps {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  onRelayToggle: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onSignInClick: () => void;
  onGuideClick: () => void;
}

const relayIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "building-2": Building2,
  users: Users,
  "gamepad-2": Gamepad2,
  cpu: Cpu,
  radio: Radio,
  "play-circle": PlayCircle,
};

export function MobileFilters({
  relays,
  channels,
  people,
  onRelayToggle,
  onChannelToggle,
  onPersonToggle,
  onAddRelay,
  onRemoveRelay,
  onSignInClick,
  onGuideClick,
}: MobileFiltersProps) {
  const truncateMobilePubkey = (value: string): string => {
    if (value.length <= 18) return value;
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
  };

  const { user, authMethod, logout, getGuestPrivateKey } = useNDK();
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [showKey, setShowKey] = useState(false);

  const displayName = useMemo(() => {
    if (!user) return "Not signed in";
    return user.profile?.displayName || user.profile?.name || `${user.npub.slice(0, 8)}...`;
  }, [user]);

  const methodLabel = authMethod === "extension"
    ? "Extension"
    : authMethod === "guest"
      ? "Guest"
      : authMethod === "nostrConnect"
        ? "Signer"
        : authMethod === "privateKey"
          ? "Private key"
          : "Unknown";

  const guestPrivateKey = getGuestPrivateKey();

  const handleAddRelay = () => {
    const trimmed = newRelayUrl.trim();
    if (!trimmed) return;
    onAddRelay(trimmed);
    setNewRelayUrl("");
  };

  const handleCopyPrivateKey = () => {
    if (!guestPrivateKey) return;
    navigator.clipboard.writeText(guestPrivateKey);
    toast.success("Private key copied to clipboard");
  };

  return (
    <ScrollArea className="flex-1" data-onboarding="mobile-filters">
      <div className="p-4 space-y-6">
        <section>
          <button
            onClick={onGuideClick}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors inline-flex items-center gap-2"
            aria-label="Open onboarding guide"
            title="Open onboarding guide"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            Open Guide
          </button>
        </section>

        {/* Profile Management */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Profile</h2>
          </div>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{displayName}</p>
                {user && (
                  <p className="text-xs text-muted-foreground">Signed in via {methodLabel}</p>
                )}
              </div>
              {!user ? (
                <button
                  onClick={onSignInClick}
                  className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground inline-flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign in
                </button>
              ) : (
                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded-md text-sm border border-destructive/40 text-destructive flex items-center gap-1"
                >
                  <LogOut className="w-3 h-3" />
                  Sign out
                </button>
              )}
            </div>

            {authMethod === "guest" && guestPrivateKey && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Key className="w-3.5 h-3.5" />
                  Private key (guest identity)
                </div>
                <div className="flex items-start gap-2">
                  <code className="block max-w-[10rem] w-full text-xs bg-muted p-2 rounded font-mono whitespace-nowrap overflow-x-auto">
                    {showKey ? guestPrivateKey : "••••••••••••••••••••••••••••••••"}
                  </code>
                  <button
                    onClick={() => setShowKey((prev) => !prev)}
                    className="p-2 rounded-md border border-border"
                    aria-label={showKey ? "Hide private key" : "Show private key"}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleCopyPrivateKey}
                    className="p-2 rounded-md border border-border"
                    aria-label="Copy private key"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Relays */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Feeds</h2>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Input
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              placeholder="wss://relay.example.com"
              className="h-9"
            />
            <button
              onClick={handleAddRelay}
              className="px-3 h-9 rounded-md border border-border text-sm flex items-center gap-1"
              aria-label="Add feed"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {relays.map((relay) => {
              const RelayIcon = relayIconMap[relay.icon] || Building2;
              return (
                <div
                  key={relay.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border",
                    relay.isActive
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <button
                    onClick={() => onRelayToggle(relay.id)}
                    className="flex items-center gap-2"
                  >
                    <RelayIcon className="w-4 h-4" />
                    {relay.name}
                    {relay.isActive && <Check className="w-3 h-3" />}
                  </button>
                  {relay.url && relay.id !== "demo" && (
                    <button
                      onClick={() => onRemoveRelay(relay.url!)}
                      className="ml-1 text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                      aria-label={`Remove feed ${relay.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Channels */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Channels</h2>
            <span className="text-xs text-muted-foreground ml-1">Tap to cycle: neutral → include → exclude</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => onChannelToggle(channel.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors border",
                  channel.filterState === "included" && "bg-success/10 border-success text-success",
                  channel.filterState === "excluded" && "bg-destructive/10 border-destructive text-destructive",
                  channel.filterState === "neutral" && "border-border hover:bg-muted"
                )}
              >
                #{channel.name}
                {channel.filterState === "included" && <Check className="w-3 h-3" />}
                {channel.filterState === "excluded" && <X className="w-3 h-3" />}
                {channel.filterState === "neutral" && <Minus className="w-3 h-3 opacity-50" />}
              </button>
            ))}
          </div>
        </section>

        {/* People */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">People</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {people.map((person) => {
              const personLabel =
                person.name === person.id ? truncateMobilePubkey(person.name) : person.name;
              return (
                <button
                  key={person.id}
                  onClick={() => onPersonToggle(person.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors border",
                    person.isSelected
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <UserAvatar
                    id={person.id}
                    displayName={person.displayName || person.name}
                    avatarUrl={person.avatar}
                    className="w-5 h-5"
                  />
                  <span className="truncate max-w-[9rem]" title={person.name}>
                    {personLabel}
                  </span>
                  {person.isSelected && <Check className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
