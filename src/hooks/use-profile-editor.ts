import { useCallback, useMemo, useState } from "react";
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
} from "@/infrastructure/preferences/user-preferences-storage";
import {
  loadPublishDelayEnabled,
  savePublishDelayEnabled,
} from "@/infrastructure/preferences/user-preferences-storage";
import {
  loadAutoCaptionEnabled,
  saveAutoCaptionEnabled,
} from "@/infrastructure/preferences/user-preferences-storage";
import { preloadLocalImageCaptionModel } from "@/lib/local-image-caption";
import { EditableNostrProfile, isNip05CompatibleName } from "@/infrastructure/nostr/profile-metadata";
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

export interface ProfileEditorValidation {
  usernameHint: string | null;
  isUsernameHintError: boolean;
  isUsernameValid: boolean;
}

export interface ProfileEditorFieldActions {
  setUsername: (value: string) => void;
  setDisplayName: (value: string) => void;
  setPicture: (value: string) => void;
  setNip05: (value: string) => void;
  setAbout: (value: string) => void;
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
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [picture, setPicture] = useState("");
  const [nip05, setNip05] = useState("");
  const [about, setAbout] = useState("");
  const [isUsernameAutoFilled, setIsUsernameAutoFilled] = useState(false);
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

  const trimmedUsername = username.trim();
  const hasTypedUsername = username.length > 0;
  const showUsernameRequired = hasTypedUsername && !trimmedUsername;
  const showUsernameInvalid =
    Boolean(trimmedUsername) && !isNip05CompatibleName(trimmedUsername);
  const showUsernameTaken =
    Boolean(trimmedUsername) &&
    !showUsernameInvalid &&
    isProfileNameTaken(trimmedUsername, {
      currentPubkey: userPubkey,
      additionalKnownNames: knownProfileNames,
    });
  const isUsernameValid = Boolean(trimmedUsername) && !showUsernameInvalid && !showUsernameTaken;
  const usernameHint = showUsernameRequired
    ? t("filters.profile.nameRequired")
    : showUsernameInvalid
      ? t("filters.profile.nameInvalidNip05")
      : showUsernameTaken
        ? t("filters.profile.nameTaken")
        : null;
  const isUsernameHintError = Boolean(usernameHint);

  const resetFromProfile = useCallback((profile: ProfileEditorSnapshot) => {
    const nextSnapshot = {
      name: normalizeSnapshotValue(profile.name),
      displayName: normalizeSnapshotValue(profile.displayName),
      picture: normalizeSnapshotValue(profile.picture),
      nip05: normalizeSnapshotValue(profile.nip05),
      about: normalizeSnapshotValue(profile.about),
    };
    setInitialProfileSnapshot(nextSnapshot);
    setUsername(nextSnapshot.name);
    setDisplayName(nextSnapshot.displayName);
    setPicture(nextSnapshot.picture);
    setNip05(nextSnapshot.nip05);
    setAbout(nextSnapshot.about);
    setIsUsernameAutoFilled(false);
    setPresencePublishingEnabled(loadPresencePublishingEnabled());
    setPublishDelayEnabled(loadPublishDelayEnabled());
    setAutoCaptionEnabled(loadAutoCaptionEnabled());
  }, []);

  const handleUsernameChange = useCallback((value: string) => {
    setUsername(value);
    setIsUsernameAutoFilled(false);
  }, []);

  const handleDisplayNameChange = useCallback((value: string) => {
    const nextAutoFilledUsername = sanitizeProfileUsername(value);
    const canAutoFillUsername = !username.trim() || isUsernameAutoFilled;

    setDisplayName(value);

    if (!canAutoFillUsername) {
      return;
    }

    setUsername(nextAutoFilledUsername);
    setIsUsernameAutoFilled(Boolean(nextAutoFilledUsername));

    featureDebugLog("profile", "Auto-filled username from display name", {
      displayName: value,
      username: nextAutoFilledUsername || null,
      userPubkey: userPubkey || null,
    });
  }, [isUsernameAutoFilled, username, userPubkey]);

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
    if (!trimmedUsername) {
      toast.error(t("filters.profile.nameRequired"));
      return false;
    }
    if (!isUsernameValid) {
      toast.error(showUsernameTaken
        ? t("filters.profile.nameTaken")
        : t("filters.profile.nameInvalidNip05"));
      return false;
    }
    setIsSavingProfile(true);
    try {
      const success = await updateUserProfile({
        name: trimmedUsername,
        displayName: displayName || undefined,
        picture: picture || undefined,
        nip05: nip05 || undefined,
        about: about || undefined,
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
      username,
      displayName,
      picture,
      nip05,
      about,
      presencePublishingEnabled,
      publishDelayEnabled,
      autoCaptionEnabled,
    }),
    [
      about,
      displayName,
      username,
      nip05,
      picture,
      presencePublishingEnabled,
      publishDelayEnabled,
      autoCaptionEnabled,
    ]
  );

  const fieldActions = useMemo<ProfileEditorFieldActions>(
    () => ({
      setUsername: handleUsernameChange,
      setDisplayName: handleDisplayNameChange,
      setPicture,
      setNip05,
      setAbout,
    }),
    [
      handleDisplayNameChange,
      handleUsernameChange,
      setAbout,
      setNip05,
      setPicture,
    ]
  );

  const validation = useMemo<ProfileEditorValidation>(
    () => ({
      usernameHint,
      isUsernameHintError,
      isUsernameValid,
    }),
    [
      isUsernameHintError,
      isUsernameValid,
      usernameHint,
    ]
  );

  const isProfileDirty = useMemo(
    () =>
      username !== initialProfileSnapshot.name ||
      displayName !== initialProfileSnapshot.displayName ||
      picture !== initialProfileSnapshot.picture ||
      nip05 !== initialProfileSnapshot.nip05 ||
      about !== initialProfileSnapshot.about,
    [
      initialProfileSnapshot.about,
      initialProfileSnapshot.displayName,
      initialProfileSnapshot.name,
      initialProfileSnapshot.nip05,
      initialProfileSnapshot.picture,
      about,
      displayName,
      username,
      nip05,
      picture,
    ]
  );

  return {
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
  };
}
