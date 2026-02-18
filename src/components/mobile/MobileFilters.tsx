import { useEffect, useMemo, useState } from "react";
import { Radio, Hash, Users, Check, X, Minus, Plus, User, LogOut, Key, Copy, Eye, EyeOff, Sparkles, LogIn, Trash2, Building2, Gamepad2, Cpu, PlayCircle, Pencil, ChevronDown } from "lucide-react";
import { Relay, Channel, Person } from "@/types";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useNDK } from "@/lib/nostr/ndk-context";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { VersionHint } from "@/components/layout/VersionHint";
import { useTranslation } from "react-i18next";
import { CompletionFeedbackToggle } from "@/components/theme/CompletionFeedbackToggle";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import {
  loadPresencePublishingEnabled,
  savePresencePublishingEnabled,
} from "@/lib/presence-preferences";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { resolveCurrentUserProfile } from "@/lib/current-user-profile-cache";

interface MobileFiltersProps {
  relays: Relay[];
  channels: Channel[];
  people: Person[];
  profileEditorOpenSignal?: number;
  onRelayToggle: (id: string) => void;
  onChannelToggle: (id: string) => void;
  onPersonToggle: (id: string) => void;
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onSignInClick: () => void;
  onGuideClick: () => void;
  completionSoundEnabled?: boolean;
  onToggleCompletionSound?: () => void;
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
  profileEditorOpenSignal = 0,
  onRelayToggle,
  onChannelToggle,
  onPersonToggle,
  onAddRelay,
  onRemoveRelay,
  onSignInClick,
  onGuideClick,
  completionSoundEnabled = true,
  onToggleCompletionSound = () => {},
}: MobileFiltersProps) {
  const { t } = useTranslation();
  const truncateMobilePubkey = (value: string): string => {
    if (value.length <= 18) return value;
    return `${value.slice(0, 10)}…${value.slice(-6)}`;
  };

  const { user, authMethod, logout, getGuestPrivateKey, needsProfileSetup, updateUserProfile, publishEvent } = useNDK();
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [profileNip05, setProfileNip05] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [presencePublishingEnabled, setPresencePublishingEnabled] = useState(() =>
    loadPresencePublishingEnabled()
  );
  const effectiveProfile = useMemo(
    () => resolveCurrentUserProfile(user?.pubkey, user?.profile),
    [user?.profile, user?.pubkey]
  );

  const displayName = useMemo(() => {
    if (!user) return t("filters.profile.notSignedIn");
    return effectiveProfile.displayName || effectiveProfile.name || `${user.npub.slice(0, 8)}...`;
  }, [effectiveProfile.displayName, effectiveProfile.name, t, user]);

  const methodLabel = authMethod === "extension"
    ? t("filters.authMethod.extension")
    : authMethod === "guest"
      ? t("filters.authMethod.guest")
      : authMethod === "nostrConnect"
        ? t("filters.authMethod.signer")
        : authMethod === "privateKey"
          ? t("filters.authMethod.privateKey")
          : t("filters.authMethod.unknown");

  const guestPrivateKey = getGuestPrivateKey();

  useEffect(() => {
    setProfileName(effectiveProfile.name || "");
    setProfileDisplayName(effectiveProfile.displayName || "");
    setProfilePicture(effectiveProfile.picture || "");
    setProfileNip05(effectiveProfile.nip05 || "");
    setProfileAbout(effectiveProfile.about || "");
    setPresencePublishingEnabled(loadPresencePublishingEnabled());
  }, [
    effectiveProfile.about,
    effectiveProfile.displayName,
    effectiveProfile.name,
    effectiveProfile.nip05,
    effectiveProfile.picture,
    needsProfileSetup,
    user,
  ]);

  useEffect(() => {
    if (profileEditorOpenSignal > 0 && user) {
      setIsProfileEditorOpen(true);
    }
  }, [profileEditorOpenSignal, user]);

  const handleAddRelay = () => {
    const trimmed = newRelayUrl.trim();
    if (!trimmed) return;
    onAddRelay(trimmed);
    setNewRelayUrl("");
  };

  const handleCopyPrivateKey = () => {
    if (!guestPrivateKey) return;
    navigator.clipboard.writeText(guestPrivateKey);
    toast.success(t("filters.profile.copiedPrivateKey"));
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      toast.error(t("filters.profile.nameRequired"));
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
        toast.success(t("filters.profile.updated"));
        setIsProfileEditorOpen(false);
      } else {
        toast.error(t("filters.profile.updateFailed"));
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePresencePublishingChange = (enabled: boolean) => {
    setPresencePublishingEnabled(enabled);
    savePresencePublishingEnabled(enabled);
    if (!enabled && user?.pubkey) {
      const expirationUnix = Math.floor(Date.now() / 1000) + NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS;
      void publishEvent(
        NostrEventKind.UserStatus,
        buildOfflinePresenceContent(),
        buildPresenceTags(expirationUnix)
      );
    }
  };

  return (
    <ScrollArea className="h-full" data-onboarding="mobile-filters">
      <div className="p-4 space-y-6">
        <section>
          <div className="flex items-center gap-2">
            <button
              onClick={onGuideClick}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm text-left hover:bg-muted/50 transition-colors inline-flex items-center gap-2"
              aria-label={t("sidebar.actions.openGuide")}
              title={t("sidebar.actions.openGuide")}
            >
              <Sparkles className="w-4 h-4 text-primary" />
              {t("navigation.mobile.openGuide")}
            </button>
            <LanguageToggle />
            <VersionHint className="shrink-0" />
            <CompletionFeedbackToggle
              enabled={completionSoundEnabled}
              onToggle={onToggleCompletionSound}
            />
          </div>
        </section>

        {/* Profile Management */}
        <section data-onboarding="mobile-filters-profile">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">{t("filters.profile.title")}</h2>
          </div>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{displayName}</p>
                {user && (
                  <p className="text-xs text-muted-foreground">
                    {authMethod === "guest"
                      ? t("filters.profile.signedInAs", { method: methodLabel })
                      : t("filters.profile.signedInVia", { method: methodLabel })}
                  </p>
                )}
              </div>
              {!user ? (
                <button
                  onClick={onSignInClick}
                  className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground inline-flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  {t("filters.profile.signin")}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsProfileEditorOpen((prev) => !prev)}
                    className="px-3 py-1.5 rounded-md text-sm border border-border inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    {t("filters.profile.edit")}
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 transition-transform",
                        isProfileEditorOpen && "rotate-180"
                      )}
                    />
                  </button>
                  <button
                    onClick={logout}
                    className="px-3 py-1.5 rounded-md text-sm border border-destructive/40 text-destructive flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    {t("filters.profile.signout")}
                  </button>
                </div>
              )}
            </div>

            {user && isProfileEditorOpen && (
              <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2.5">
                <div className="space-y-1">
                  <label htmlFor="manage-profile-name" className="text-xs text-muted-foreground">{t("filters.profile.name")}</label>
                  <Input
                    id="manage-profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="manage-profile-display-name" className="text-xs text-muted-foreground">{t("filters.profile.displayName")}</label>
                  <Input
                    id="manage-profile-display-name"
                    value={profileDisplayName}
                    onChange={(e) => setProfileDisplayName(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="manage-profile-picture" className="text-xs text-muted-foreground">{t("filters.profile.picture")}</label>
                  <Input
                    id="manage-profile-picture"
                    value={profilePicture}
                    onChange={(e) => setProfilePicture(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="manage-profile-nip05" className="text-xs text-muted-foreground">{t("filters.profile.nip05")}</label>
                  <Input
                    id="manage-profile-nip05"
                    value={profileNip05}
                    onChange={(e) => setProfileNip05(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="manage-profile-about" className="text-xs text-muted-foreground">{t("filters.profile.about")}</label>
                  <Textarea
                    id="manage-profile-about"
                    value={profileAbout}
                    onChange={(e) => setProfileAbout(e.target.value)}
                    rows={3}
                    className="min-h-20"
                  />
                </div>
                <label htmlFor="manage-profile-presence-enabled" className="flex items-start gap-2 rounded-md border border-border/70 px-2.5 py-2">
                  <input
                    id="manage-profile-presence-enabled"
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
                <div className="flex items-center justify-end gap-2 pt-1">
                  {!needsProfileSetup && (
                    <button
                      onClick={() => setIsProfileEditorOpen(false)}
                      className="px-3 py-1.5 rounded-md text-sm border border-border"
                      disabled={isSavingProfile}
                    >
                      {t("filters.profile.cancel")}
                    </button>
                  )}
                  <button
                    onClick={handleSaveProfile}
                    className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground"
                    disabled={isSavingProfile}
                  >
                    {isSavingProfile ? t("filters.profile.saving") : t("filters.profile.save")}
                  </button>
                </div>
              </div>
            )}

            {authMethod === "guest" && guestPrivateKey && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Key className="w-3.5 h-3.5" />
                  {t("filters.profile.privateKey")}
                </div>
                <div className="flex items-start gap-2">
                  <code className="block max-w-[10rem] w-full text-xs bg-muted p-2 rounded font-mono whitespace-nowrap overflow-x-auto">
                    {showKey ? guestPrivateKey : "••••••••••••••••••••••••••••••••"}
                  </code>
                  <button
                    onClick={() => setShowKey((prev) => !prev)}
                    className="p-2 rounded-md border border-border"
                    aria-label={showKey ? t("filters.profile.hidePrivateKey") : t("filters.profile.showPrivateKey")}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleCopyPrivateKey}
                    className="p-2 rounded-md border border-border"
                    aria-label={t("filters.profile.copyPrivateKey")}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Relays */}
        <section data-onboarding="mobile-filters-relays">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">{t("filters.feeds.title")}</h2>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Input
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              placeholder={t("filters.feeds.placeholder")}
              className="h-9"
            />
            <button
              onClick={handleAddRelay}
              className="px-3 h-9 rounded-md border border-border text-sm flex items-center gap-1"
              aria-label={t("filters.feeds.addAria")}
            >
              <Plus className="w-3.5 h-3.5" />
              {t("filters.feeds.add")}
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
                      aria-label={t("filters.feeds.removeAria", { name: relay.name })}
                    >
                      <Trash2 className="w-3 h-3" />
                      {t("filters.feeds.remove")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Channels */}
        <section data-onboarding="mobile-filters-channels">
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">{t("filters.channels.title")}</h2>
            <span className="text-xs text-muted-foreground ml-1">{t("filters.channels.cycleHint")}</span>
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
        <section data-onboarding="mobile-filters-people">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">{t("filters.people.title")}</h2>
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
