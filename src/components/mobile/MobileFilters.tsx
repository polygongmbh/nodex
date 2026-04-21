import { useEffect, useMemo, useState } from "react";
import { Radio, Hash, Users, Check, X, Minus, Plus, User, LogOut, Sparkles, LogIn, Trash2, Pencil, ChevronDown, Mail } from "lucide-react";
import { Relay, Channel, ChannelMatchMode } from "@/types";
import type { Person } from "@/types/person";
import { cn } from "@/lib/utils";
import { getRelayStatusDotClass } from "@/components/relay/relayStatusStyles";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { VersionHint } from "@/components/layout/VersionHint";
import { LegalDialog, resolveLegalContactEmail } from "@/components/legal/LegalDialog";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { ChannelMatchModeToggle } from "@/components/filters/ChannelMatchModeToggle";
import { GuestPrivateKeyRow } from "@/components/auth/GuestPrivateKeyRow";
import { getAppPreferenceDefinitions } from "@/lib/app-preferences";
import { useProfileEditor } from "@/hooks/use-profile-editor";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { relayUrlToName } from "@/infrastructure/nostr/relay-url";
import { resolveRelayIcon } from "@/infrastructure/nostr/relay-icon";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { getCompactPersonLabel, getPersonDisplayName } from "@/types/person";

interface MobileFiltersProps {
  relays?: Relay[];
  channels?: Channel[];
  channelMatchMode?: ChannelMatchMode;
  people?: Person[];
  profileEditorOpenSignal?: number;
}

export function MobileFilters({
  relays: relaysProp,
  channels: channelsProp,
  channelMatchMode: channelMatchModeProp,
  people: peopleProp,
  profileEditorOpenSignal = 0,
}: MobileFiltersProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const surface = useFeedSurfaceState();
  const relays = relaysProp ?? surface.relays;
  const channels = channelsProp ?? surface.visibleChannels ?? surface.channels;
  const people = peopleProp ?? surface.visiblePeople ?? surface.people;
  const channelMatchMode = channelMatchModeProp ?? surface.channelMatchMode ?? "and";
  const legalContactEmail = useMemo(() => resolveLegalContactEmail(), []);

  const { user, authMethod, logout, getGuestPrivateKey, needsProfileSetup, updateUserProfile, publishEvent } = useNDK();
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const effectiveProfile = useMemo(() => user?.profile ?? {}, [user?.profile]);
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
    knownProfileNames: people
      .filter((person) => person.id !== user?.pubkey)
      .map((person) => person.name),
    t,
    updateUserProfile,
    publishEvent,
    onSaved: () => setIsProfileEditorOpen(false),
  });

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
        : authMethod === "noas"
          ? t("filters.authMethod.noas")
        : authMethod === "privateKey"
          ? t("filters.authMethod.privateKey")
          : t("filters.authMethod.unknown");

  const guestPrivateKey = getGuestPrivateKey();
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
  const appPreferenceRows = getAppPreferenceDefinitions("mobile").map((preference) => ({
    id: `manage-preference-${preference.id}`,
    checked: preferenceState[preference.key].checked,
    onChange: preferenceState[preference.key].onChange,
    label: t(preference.labelKey),
    description: t(preference.descriptionKey),
  }));

  useEffect(() => {
    resetFromProfile(effectiveProfile);
  }, [
    effectiveProfile,
    needsProfileSetup,
    resetFromProfile,
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
    void dispatchFeedInteraction({ type: "sidebar.relay.add", url: trimmed });
    setNewRelayUrl("");
  };

  const handleCopyPrivateKey = () => {
    if (!guestPrivateKey) return;
    navigator.clipboard.writeText(guestPrivateKey);
    toast.success(t("filters.profile.copiedPrivateKey"));
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4" data-onboarding="mobile-filters">
        <section>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void dispatchFeedInteraction({ type: "ui.openGuide" });
              }}
              className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm text-left hover:bg-muted/50 active:bg-muted transition-colors inline-flex items-center gap-2 touch-target-sm"
              aria-label={t("sidebar.actions.openGuide")}
              title={t("sidebar.actions.openGuide")}
            >
              <Sparkles className="w-4 h-4 text-primary" />
              {t("navigation.mobile.openGuide")}
            </button>
            <LanguageToggle
              className="h-10 flex-1 justify-between rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted/70 data-[state=open]:bg-muted/70"
              showLabelOnMobile
            />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <LegalDialog
              triggerLabel={t("legal.buttons.imprint")}
              triggerClassName="w-full rounded-lg border border-border px-2 py-2 text-xs text-center hover:bg-muted/50 active:bg-muted touch-target-sm"
              defaultSection="imprint"
            />
            <LegalDialog
              triggerLabel={t("legal.buttons.privacy")}
              triggerClassName="w-full rounded-lg border border-border px-2 py-2 text-xs text-center hover:bg-muted/50 active:bg-muted touch-target-sm"
              defaultSection="privacy"
            />
            <a
              href={`mailto:${legalContactEmail}`}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-2 text-xs text-center text-muted-foreground hover:bg-muted/50 active:bg-muted hover:text-foreground touch-target-sm"
              aria-label={t("legal.hints.contactByEmail")}
              title={t("legal.hints.contactByEmail")}
            >
              <Mail className="h-3.5 w-3.5" />
              {t("legal.buttons.contact")}
            </a>
            <VersionHint
              className="w-full rounded-lg border border-border px-2 py-2 text-xs text-center text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground touch-target-sm"
              showChangelogLabel
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
                  onClick={() => {
                    void dispatchFeedInteraction({ type: "ui.openAuthModal" });
                  }}
                  className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground inline-flex items-center gap-1.5 touch-target-sm active:scale-95 transition-transform"
                >
                  <LogIn className="w-4 h-4" />
                  {t("filters.profile.signin")}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsProfileEditorOpen((prev) => !prev)}
                    className="px-3 py-2 rounded-lg text-sm border border-border inline-flex items-center gap-1.5 touch-target-sm active:bg-muted transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t("filters.profile.edit")}
                    <ChevronDown
                      className={cn(
                        "w-3.5 h-3.5 transition-transform",
                        isProfileEditorOpen && "rotate-180"
                      )}
                    />
                  </button>
                  <button
                    onClick={logout}
                    className="px-3 py-2 rounded-lg text-sm border border-destructive/40 text-destructive flex items-center gap-1.5 touch-target-sm active:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t("filters.profile.signout")}
                  </button>
                </div>
              )}
            </div>

            {user && isProfileEditorOpen && (
              <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2.5">
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
                  <label htmlFor="manage-profile-name" className="text-xs text-muted-foreground">{t("filters.profile.name")}</label>
                  <Input
                    id="manage-profile-name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="h-8"
                    aria-invalid={showProfileNameRequired || showProfileNameInvalid || showProfileNameTaken}
                    aria-describedby={showProfileNameRequired || showProfileNameInvalid || showProfileNameTaken ? "manage-profile-name-error" : undefined}
                  />
                  {showProfileNameRequired && (
                    <p id="manage-profile-name-error" className="text-xs text-destructive">
                      {t("filters.profile.nameRequired")}
                    </p>
                  )}
                  {!showProfileNameRequired && showProfileNameInvalid && (
                    <p id="manage-profile-name-error" className="text-xs text-destructive">
                      {t("filters.profile.nameInvalidNip05")}
                    </p>
                  )}
                  {!showProfileNameRequired && !showProfileNameInvalid && showProfileNameTaken && (
                    <p id="manage-profile-name-error" className="text-xs text-destructive">
                      {t("filters.profile.nameTaken")}
                    </p>
                  )}
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
                <div className="flex items-center justify-end gap-2 pt-2">
                  {!needsProfileSetup && (
                    <button
                      onClick={() => setIsProfileEditorOpen(false)}
                      className="px-4 py-2 rounded-lg text-sm border border-border touch-target-sm active:bg-muted transition-colors"
                      disabled={isSavingProfile}
                    >
                      {t("filters.profile.cancel")}
                    </button>
                  )}
                  <button
                    onClick={handleSaveProfile}
                    className="px-4 py-2 rounded-lg text-sm bg-primary text-primary-foreground touch-target-sm active:scale-95 transition-transform"
                    disabled={isSavingProfile || !isProfileNameValid}
                  >
                    {isSavingProfile ? t("filters.profile.saving") : t("filters.profile.save")}
                  </button>
                </div>
              </div>
            )}

            {authMethod === "guest" && guestPrivateKey && (
              <GuestPrivateKeyRow
                value={guestPrivateKey}
                showKey={showKey}
                onToggleShow={() => setShowKey((prev) => !prev)}
                onCopy={handleCopyPrivateKey}
              />
            )}
          </div>
        </section>

        {user && (
          <section data-onboarding="mobile-filters-preferences">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">{t("filters.profile.appPreferencesTitle")}</h2>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="space-y-3">
                {appPreferenceRows.map((preference, index) => (
                  <div key={preference.id} className={cn(index > 0 && "border-t border-border/60 pt-3")}>
                    <label htmlFor={preference.id} className="flex items-start gap-2.5">
                      <input
                        id={preference.id}
                        type="checkbox"
                        checked={preference.checked}
                        onChange={(event) => preference.onChange(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span className="space-y-0.5">
                        <span className="block text-xs font-medium leading-tight">{preference.label}</span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">{preference.description}</span>
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

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
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                handleAddRelay();
              }}
              placeholder={t("filters.feeds.placeholder")}
              className="h-9"
            />
            <button
              onClick={handleAddRelay}
              className="px-3 h-10 rounded-lg border border-border text-sm flex items-center gap-1.5 touch-target-sm active:bg-muted transition-colors"
              aria-label={t("filters.feeds.addAria")}
            >
              <Plus className="w-4 h-4" />
              {t("filters.feeds.add")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {relays.map((relay) => {
              const RelayIcon = resolveRelayIcon(relay.url);
              const relayDisplayName = relayUrlToName(relay.url);
              const resolvedConnectionStatus = relay.id === "demo" || !relay.connectionStatus ? "connected" : relay.connectionStatus;
              const isConnectionActive = resolvedConnectionStatus === "connected";
              const connectionDotClass = getRelayStatusDotClass(resolvedConnectionStatus);
              return (
                <div
                  key={relay.id}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors border touch-target-sm",
                    relay.isActive
                      ? "bg-primary/10 border-primary text-primary motion-filter-pop"
                      : "border-border hover:bg-muted",
                    relay.isActive && !isConnectionActive && "bg-warning/10 border-warning/40 text-foreground"
                  )}
                >
                  <button
                    onClick={() => {
                      void dispatchFeedInteraction({ type: "sidebar.relay.toggle", relayId: relay.id });
                    }}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <RelayIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{relayDisplayName}</span>
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full shrink-0",
                        connectionDotClass
                      )}
                      title={resolvedConnectionStatus === "read-only" ? t("relay.statusHints.readOnly") : resolvedConnectionStatus}
                      aria-label={resolvedConnectionStatus === "read-only" ? t("relay.statusHints.readOnly") : resolvedConnectionStatus}
                    />
                    {relay.isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                  {relay.url && relay.id !== "demo" && (
                    <button
                      onClick={() => {
                        void dispatchFeedInteraction({ type: "sidebar.relay.remove", url: relay.url! });
                      }}
                      className="ml-1 p-1.5 rounded text-muted-foreground hover:text-destructive active:bg-destructive/10 inline-flex items-center gap-1 touch-target-sm"
                      aria-label={t("filters.feeds.removeAria", { name: relayDisplayName })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
            <ChannelMatchModeToggle
              mode={channelMatchMode}
              onChange={(mode) => {
                void dispatchFeedInteraction({ type: "sidebar.channel.matchMode.change", mode });
              }}
              size="mobile"
              className="ml-auto"
            />
            <span className="text-xs text-muted-foreground ml-1">{t("filters.channels.cycleHint")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => {
                  void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm transition-colors border touch-target-sm active:scale-95",
                  channel.filterState === "included" && "bg-success/10 border-success text-success motion-filter-pop",
                  channel.filterState === "excluded" && "bg-destructive/10 border-destructive text-destructive motion-filter-pop-alt",
                  channel.filterState === "neutral" && "border-border hover:bg-muted"
                )}
              >
                #{channel.name}
                {channel.filterState === "included" && <Check className="w-3.5 h-3.5" />}
                {channel.filterState === "excluded" && <X className="w-3.5 h-3.5" />}
                {channel.filterState === "neutral" && <Minus className="w-3.5 h-3.5 opacity-50" />}
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
              const personDisplayName = getPersonDisplayName(person);
              const personLabel = getCompactPersonLabel(person);
              return (
                <button
                  key={person.id}
                  onClick={() => {
                    void dispatchFeedInteraction({ type: "sidebar.person.toggle", personId: person.id });
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors border touch-target-sm active:scale-95",
                    person.isSelected
                      ? "bg-primary/10 border-primary text-primary motion-filter-pop"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <UserAvatar
                    id={person.id}
                    displayName={personDisplayName}
                    avatarUrl={person.avatar}
                    className="w-6 h-6"
                  />
                  <span className="truncate max-w-[9rem]" title={personDisplayName}>
                    {personLabel}
                  </span>
                  {person.isSelected && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </section>

    </div>
  );
}
