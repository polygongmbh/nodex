import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Users, Check, X, Minus, User, LogOut, Sparkles, LogIn, Pencil, Mail, Scale, ShieldCheck, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Relay, Channel, ChannelMatchMode } from "@/types";
import type { Person } from "@/types/person";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { toast } from "sonner";
import { VersionHint } from "@/components/layout/VersionHint";
import { LegalDialog, resolveLegalContactEmail } from "@/components/legal/LegalDialog";
import { useTranslation } from "react-i18next";
import { LanguageToggle } from "@/components/theme/LanguageToggle";
import { ChannelMatchModeToggle } from "@/components/filters/ChannelMatchModeToggle";
import { GuestPrivateKeyRow } from "@/components/auth/GuestPrivateKeyRow";
import { ProfileEditorFields } from "@/components/auth/ProfileEditorFields";
import { getAppPreferenceDefinitions } from "@/lib/app-preferences";
import { useProfileEditor } from "@/hooks/use-profile-editor";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { getCompactPersonLabel, getPersonDisplayName } from "@/types/person";
import { MobileRelaysSection } from "./MobileRelaysSection";
import type { TFunction } from "i18next";

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
  const { t } = useTranslation("filters");
  const translateMixedKey = ((key: string, values?: Record<string, unknown>) => {
    if (key.startsWith("auth.")) return t(`auth:${key}`, values);
    if (key.startsWith("relay.")) return t(`relay:${key}`, values);
    if (key.startsWith("sidebar.")) return t(`shell:${key}`, values);
    if (key.startsWith("navigation.")) return t(`shell:${key}`, values);
    if (key.startsWith("legal.")) return t(`shell:${key}`, values);
    return t(key, values);
  }) as TFunction;
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const surface = useFeedSurfaceState();
  const relays = relaysProp ?? surface.relays;
  const channels = channelsProp ?? surface.visibleChannels ?? surface.channels;
  const people = peopleProp ?? surface.visiblePeople ?? surface.people;
  const channelMatchMode = channelMatchModeProp ?? surface.channelMatchMode ?? "and";
  const legalContactEmail = useMemo(() => resolveLegalContactEmail(), []);

  const { user, authMethod, hasWritableRelayConnection, logout, getGuestPrivateKey, needsProfileSetup, updateUserProfile, publishEvent } = useNDK();
  const [showKey, setShowKey] = useState(false);
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
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
    knownProfileNames: people
      .filter((person) => person.id !== user?.pubkey)
      .map((person) => person.name),
    t: translateMixedKey,
    updateUserProfile,
    publishEvent,
    onSaved: () => setIsProfileEditorOpen(false),
  });
  const { presencePublishingEnabled, publishDelayEnabled, autoCaptionEnabled } = fields;
  const canDismissProfileEditor = !needsProfileSetup;
  const { isUsernameValid } = validation;

  const displayName = useMemo(() => {
    if (!user) return t("auth:auth.profile.notSignedIn");
    return effectiveProfile.displayName || effectiveProfile.name || `${user.npub.slice(0, 8)}...`;
  }, [effectiveProfile.displayName, effectiveProfile.name, t, user]);

  const methodLabel = authMethod === "extension"
    ? t("auth:auth.authMethod.extension")
    : authMethod === "guest"
      ? t("auth:auth.authMethod.guest")
      : authMethod === "nostrConnect"
        ? t("auth:auth.authMethod.signer")
        : authMethod === "noas"
          ? t("auth:auth.authMethod.noas")
        : authMethod === "privateKey"
          ? t("auth:auth.authMethod.privateKey")
          : t("auth:auth.authMethod.unknown");

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
    label: translateMixedKey(preference.labelKey),
    description: translateMixedKey(preference.descriptionKey),
  }));

  useEffect(() => {
    resetFromProfile(effectiveProfile);
  }, [
    effectiveProfile,
    needsProfileSetup,
    resetFromProfile,
    user,
  ]);

  const lastHandledProfileEditorOpenSignalRef = useRef(0);
  useEffect(() => {
    if (profileEditorOpenSignal <= 0 || !user) return;
    if (profileEditorOpenSignal === lastHandledProfileEditorOpenSignalRef.current) return;
    lastHandledProfileEditorOpenSignalRef.current = profileEditorOpenSignal;
    if (!hasWritableRelayConnection) {
      toast.error(t("auth:auth.profile.noRelayConnected"));
      return;
    }
    setIsProfileEditorOpen(true);
  }, [hasWritableRelayConnection, profileEditorOpenSignal, t, user]);

  const handleOpenProfileEditor = () => {
    if (!hasWritableRelayConnection) {
      toast.error(t("auth:auth.profile.noRelayConnected"));
      return;
    }
    setIsProfileEditorOpen(true);
  };

  const handleCopyPrivateKey = () => {
    if (!guestPrivateKey) return;
    navigator.clipboard.writeText(guestPrivateKey);
    toast.success(t("auth:auth.profile.copiedPrivateKey"));
  };

  return (
    <>
      <div className="h-full overflow-y-auto p-4 space-y-4" data-onboarding="mobile-filters">
        <section>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void dispatchFeedInteraction({ type: "ui.openGuide" });
              }}
              className="flex-1 rounded-lg border border-border px-3 py-2.5 text-sm text-left hover:bg-muted/50 active:bg-muted transition-colors inline-flex items-center gap-2 touch-target-sm"
              aria-label={t("shell:sidebar.actions.openGuide")}
              title={t("shell:sidebar.actions.openGuide")}
            >
              <Sparkles className="w-4 h-4 text-primary" />
              {t("shell:navigation.mobile.openGuide")}
            </button>
            <LanguageToggle
              className="h-10 flex-1 justify-between rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted/70 data-[state=open]:bg-muted/70"
              showLabelOnMobile
            />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            <LegalDialog
              triggerLabel={t("shell:legal.buttons.imprint")}
              triggerClassName="w-full rounded-lg border border-border px-2 py-2 text-xs text-center hover:bg-muted/50 active:bg-muted touch-target-sm"
              defaultSection="imprint"
              triggerIcon={<Scale className="h-3.5 w-3.5 shrink-0" />}
            />
            <LegalDialog
              triggerLabel={t("shell:legal.buttons.privacy")}
              triggerClassName="w-full rounded-lg border border-border px-2 py-2 text-xs text-center hover:bg-muted/50 active:bg-muted touch-target-sm"
              defaultSection="privacy"
              triggerIcon={<ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
            />
            <a
              href={`mailto:${legalContactEmail}`}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-2 text-xs text-center text-muted-foreground hover:bg-muted/50 active:bg-muted hover:text-foreground touch-target-sm"
              aria-label={t("shell:legal.hints.contactByEmail")}
              title={t("shell:legal.hints.contactByEmail")}
            >
              <Mail className="h-3.5 w-3.5" />
              {t("shell:legal.buttons.contact")}
            </a>
            <VersionHint
              className="w-full rounded-lg border border-border px-2 py-2 text-xs text-center text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground touch-target-sm"
              showChangelogLabel
              triggerIcon={<History className="h-3.5 w-3.5 shrink-0" />}
            />
          </div>
        </section>

        {/* Profile Management */}
        <section data-onboarding="mobile-filters-profile">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">{t("auth:auth.profile.title")}</h2>
          </div>
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{displayName}</p>
                {user && (
                  <p className="text-xs text-muted-foreground">
                    {authMethod === "guest"
                      ? t("auth:auth.profile.signedInAs", { method: methodLabel })
                      : t("auth:auth.profile.signedInVia", { method: methodLabel })}
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
                  {t("auth:auth.profile.signin")}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenProfileEditor}
                    disabled={!hasWritableRelayConnection}
                    title={!hasWritableRelayConnection ? t("auth:auth.profile.noRelayConnected") : undefined}
                    aria-label={!hasWritableRelayConnection ? t("auth:auth.profile.noRelayConnected") : t("auth:auth.profile.edit")}
                    className="px-3 py-2 rounded-lg text-sm border border-border inline-flex items-center gap-1.5 touch-target-sm active:bg-muted transition-colors disabled:opacity-50 disabled:active:bg-transparent disabled:cursor-not-allowed"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t("auth:auth.profile.edit")}
                  </button>
                  <button
                    onClick={logout}
                    className="px-3 py-2 rounded-lg text-sm border border-destructive/40 text-destructive flex items-center gap-1.5 touch-target-sm active:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t("auth:auth.profile.signout")}
                  </button>
                </div>
              )}
            </div>

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
              <h2 className="font-semibold text-sm">{t("auth:auth.profile.appPreferencesTitle")}</h2>
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

        <MobileRelaysSection relays={relays} />

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

      {user && (
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
                <DialogTitle>
                  {needsProfileSetup
                    ? t("auth:auth.menu.profileSetupTitle")
                    : t("auth:auth.menu.profileEditTitle")}
                </DialogTitle>
                <DialogDescription>
                  {t("auth:auth.menu.profileDescription")}
                </DialogDescription>
              </DialogHeader>
              <DialogScrollBody className="mt-3">
                <ProfileEditorFields
                  fields={fields}
                  validation={validation}
                  fieldActions={fieldActions}
                  t={translateMixedKey}
                />
              </DialogScrollBody>
              <div className="mt-3 flex shrink-0 justify-end gap-2 bg-background/95 pt-2">
                {!needsProfileSetup && (
                  <Button
                    variant="outline"
                    onClick={() => setIsProfileEditorOpen(false)}
                    disabled={isSavingProfile}
                  >
                    {t("auth:auth.profile.cancel")}
                  </Button>
                )}
                <Button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile || !isUsernameValid}
                >
                  {isSavingProfile ? t("auth:auth.profile.saving") : t("auth:auth.profile.save")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
