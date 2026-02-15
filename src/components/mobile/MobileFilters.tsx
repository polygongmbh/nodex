import { useMemo, useState } from "react";
import { Radio, Hash, Users, Check, X, Minus, Plus, User, LogOut, Key, Copy, Eye, EyeOff } from "lucide-react";
import { Relay, Channel, Person } from "@/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
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
}

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
}: MobileFiltersProps) {
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
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-6">
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
                  className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground"
                >
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
            {relays.map((relay) => (
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
                  <span className="text-base">{relay.icon}</span>
                  {relay.name}
                  {relay.isActive && <Check className="w-3 h-3" />}
                </button>
                {relay.url && relay.id !== "demo" && (
                  <button
                    onClick={() => onRemoveRelay(relay.url!)}
                    className="ml-1 text-xs text-muted-foreground hover:text-destructive"
                    aria-label={`Remove feed ${relay.name}`}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
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
            {people.map((person) => (
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
                <img
                  src={person.avatar}
                  alt={person.name}
                  className="w-5 h-5 rounded-full"
                />
                {person.name}
                {person.isSelected && <Check className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
