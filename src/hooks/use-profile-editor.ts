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
} from "@/infrastructure/preferences/user-preferences";
import {
  loadPublishDelayEnabled,
  savePublishDelayEnabled,
} from "@/infrastructure/preferences/user-preferences";
import {
  loadAutoCaptionEnabled,
  saveAutoCaptionEnabled,
} from "@/infrastructure/preferences/user-preferences";
import { preloadLocalImageCaptionModel } from "@/lib/local-image-caption";
import { EditableNostrProfile, isNip05CompatibleName } from "@/lib/nostr/profile-metadata";
import { isProfileNameTaken } from "@/lib/profile-name-uniqueness";
import { featureDebugLog } from "@/lib/feature-debug";
import { sanitizeProfileUsername } from "@/lib/profile-username";

interface ProfileEditorSnapshot {
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  about?: string;
}

function normalizeSnapshotValue(value?: string) {
  return value || "";
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
  const [isProfileNameAutoFilled, setIsProfileNameAutoFilled] = useState(false);
  const [initialProfileSnapshot, setInitialProfileSnapshot] = useState<Required<ProfileEditorSnapshot>>({
    name: "",
    displayName: "",
    picture: "",
    nip05: "",
    about: "",
  });
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
    const nextSnapshot = {
      name: normalizeSnapshotValue(profile.name),
      displayName: normalizeSnapshotValue(profile.displayName),
      picture: normalizeSnapshotValue(profile.picture),
      nip05: normalizeSnapshotValue(profile.nip05),
      about: normalizeSnapshotValue(profile.about),
    };
    setInitialProfileSnapshot(nextSnapshot);
    setProfileName(nextSnapshot.name);
    setProfileDisplayName(nextSnapshot.displayName);
    setProfilePicture(nextSnapshot.picture);
    setProfileNip05(nextSnapshot.nip05);
    setProfileAbout(nextSnapshot.about);
    setIsProfileNameAutoFilled(false);
    setPresencePublishingEnabled(loadPresencePublishingEnabled());
    setPublishDelayEnabled(loadPublishDelayEnabled());
    setAutoCaptionEnabled(loadAutoCaptionEnabled());
  };

  const handleProfileNameChange = (value: string) => {
    setProfileName(value);
    setIsProfileNameAutoFilled(false);
  };

  const handleProfileDisplayNameChange = (value: string) => {
    const nextAutoFilledName = sanitizeProfileUsername(value);
    const canAutoFillProfileName = !profileName.trim() || isProfileNameAutoFilled;

    setProfileDisplayName(value);

    if (!canAutoFillProfileName) {
      return;
    }

    setProfileName(nextAutoFilledName);
    setIsProfileNameAutoFilled(Boolean(nextAutoFilledName));

    featureDebugLog("profile", "Auto-filled username from display name", {
      displayName: value,
      username: nextAutoFilledName || null,
      userPubkey: userPubkey || null,
    });
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

  const isProfileDirty = useMemo(
    () =>
      profileName !== initialProfileSnapshot.name ||
      profileDisplayName !== initialProfileSnapshot.displayName ||
      profilePicture !== initialProfileSnapshot.picture ||
      profileNip05 !== initialProfileSnapshot.nip05 ||
      profileAbout !== initialProfileSnapshot.about,
    [
      initialProfileSnapshot.about,
      initialProfileSnapshot.displayName,
      initialProfileSnapshot.name,
      initialProfileSnapshot.nip05,
      initialProfileSnapshot.picture,
      profileAbout,
      profileDisplayName,
      profileName,
      profileNip05,
      profilePicture,
    ]
  );

  return {
    fields,
    isProfileDirty,
    isSavingProfile,
    validation: {
      showProfileNameRequired,
      showProfileNameInvalid,
      showProfileNameTaken,
      isProfileNameValid,
    },
    setProfileName: handleProfileNameChange,
    setProfileDisplayName: handleProfileDisplayNameChange,
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
