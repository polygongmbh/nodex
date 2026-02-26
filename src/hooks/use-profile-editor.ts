import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TFunction } from "i18next";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import {
  loadPresencePublishingEnabled,
  savePresencePublishingEnabled,
} from "@/lib/presence-preferences";
import {
  loadPublishDelayEnabled,
  savePublishDelayEnabled,
} from "@/lib/publish-delay-preferences";
import {
  loadAutoCaptionEnabled,
  saveAutoCaptionEnabled,
} from "@/lib/auto-caption-preferences";
import { preloadLocalImageCaptionModel } from "@/lib/local-image-caption";
import { EditableNostrProfile, isNip05CompatibleName } from "@/lib/nostr/profile-metadata";
import { isProfileNameTaken } from "@/lib/profile-name-uniqueness";
import { featureDebugLog } from "@/lib/feature-debug";

interface ProfileEditorSnapshot {
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  about?: string;
}

interface UseProfileEditorOptions {
  userPubkey?: string;
  knownProfileNames?: string[];
  t: TFunction;
  updateUserProfile: (profile: EditableNostrProfile) => Promise<boolean>;
  publishEvent: (kind: NostrEventKind, content: string, tags?: string[][]) => Promise<{ success: boolean; eventId?: string }>;
  onSaved?: () => void;
}

export function useProfileEditor({
  userPubkey,
  knownProfileNames = [],
  t,
  updateUserProfile,
  publishEvent,
  onSaved,
}: UseProfileEditorOptions) {
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [profileNip05, setProfileNip05] = useState("");
  const [profileAbout, setProfileAbout] = useState("");
  const [presencePublishingEnabled, setPresencePublishingEnabled] = useState(() =>
    loadPresencePublishingEnabled()
  );
  const [publishDelayEnabled, setPublishDelayEnabled] = useState(() =>
    loadPublishDelayEnabled()
  );
  const [autoCaptionEnabled, setAutoCaptionEnabled] = useState(() =>
    loadAutoCaptionEnabled()
  );

  const trimmedProfileName = profileName.trim();
  const hasTypedProfileName = profileName.length > 0;
  const showProfileNameRequired = hasTypedProfileName && !trimmedProfileName;
  const showProfileNameInvalid =
    Boolean(trimmedProfileName) && !isNip05CompatibleName(trimmedProfileName);
  const showProfileNameTaken =
    Boolean(trimmedProfileName) &&
    !showProfileNameInvalid &&
    isProfileNameTaken(trimmedProfileName, {
      currentPubkey: userPubkey,
      additionalKnownNames: knownProfileNames,
    });
  const isProfileNameValid = Boolean(trimmedProfileName) && !showProfileNameInvalid && !showProfileNameTaken;

  const resetFromProfile = (profile: ProfileEditorSnapshot) => {
    setProfileName(profile.name || "");
    setProfileDisplayName(profile.displayName || "");
    setProfilePicture(profile.picture || "");
    setProfileNip05(profile.nip05 || "");
    setProfileAbout(profile.about || "");
    setPresencePublishingEnabled(loadPresencePublishingEnabled());
    setPublishDelayEnabled(loadPublishDelayEnabled());
    setAutoCaptionEnabled(loadAutoCaptionEnabled());
  };

  const handlePresencePublishingChange = (enabled: boolean) => {
    setPresencePublishingEnabled(enabled);
    savePresencePublishingEnabled(enabled);
    if (!enabled && userPubkey) {
      const expirationUnix = Math.floor(Date.now() / 1000) + NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS;
      void publishEvent(
        NostrEventKind.UserStatus,
        buildOfflinePresenceContent(),
        buildPresenceTags(expirationUnix)
      );
    }
  };

  const handlePublishDelayChange = (enabled: boolean) => {
    setPublishDelayEnabled(enabled);
    savePublishDelayEnabled(enabled);
  };

  const handleAutoCaptionChange = (enabled: boolean) => {
    setAutoCaptionEnabled(enabled);
    saveAutoCaptionEnabled(enabled);
    featureDebugLog("auto-caption", "Profile auto-caption preference changed", {
      enabled,
      userPubkey: userPubkey || null,
    });
    if (enabled) {
      void preloadLocalImageCaptionModel();
    }
  };

  const handleSaveProfile = async () => {
    if (!trimmedProfileName) {
      toast.error(t("filters.profile.nameRequired"));
      return false;
    }
    if (!isProfileNameValid) {
      toast.error(showProfileNameTaken
        ? t("filters.profile.nameTaken")
        : t("filters.profile.nameInvalidNip05"));
      return false;
    }
    setIsSavingProfile(true);
    try {
      const success = await updateUserProfile({
        name: trimmedProfileName,
        displayName: profileDisplayName || undefined,
        picture: profilePicture || undefined,
        nip05: profileNip05 || undefined,
        about: profileAbout || undefined,
      });
      if (success) {
        toast.success(t("filters.profile.updated"));
        onSaved?.();
      } else {
        toast.error(t("filters.profile.updateFailed"));
      }
      return success;
    } finally {
      setIsSavingProfile(false);
    }
  };

  const fields = useMemo(
    () => ({
      profileName,
      profileDisplayName,
      profilePicture,
      profileNip05,
      profileAbout,
      presencePublishingEnabled,
      publishDelayEnabled,
      autoCaptionEnabled,
    }),
    [
      profileAbout,
      profileDisplayName,
      profileName,
      profileNip05,
      profilePicture,
      presencePublishingEnabled,
      publishDelayEnabled,
      autoCaptionEnabled,
    ]
  );

  return {
    fields,
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
  };
}
