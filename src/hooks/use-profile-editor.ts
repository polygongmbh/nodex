import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TFunction } from "i18next";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  NIP38_PRESENCE_CLEAR_EXPIRY_SECONDS,
  buildOfflinePresenceContent,
  buildPresenceTags,
} from "@/lib/presence-status";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
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

export type Nip05VerifyStatus = "idle" | "verifying" | "verified" | "invalid" | "error";

interface UseProfileEditorOptions {
  userPubkey?: string;
  knownProfileNames?: string[];
  t: TFunction;
  updateUserProfile: (profile: EditableNostrProfile) => Promise<boolean>;
  publishEvent: (kind: NostrEventKind, content: string, tags?: string[][]) => Promise<{ success: boolean; eventId?: string }>;
  validateNip05?: (nip05: string) => Promise<boolean | null>;
  onSaved?: () => void;
}

export interface ProfileEditorValidation {
  usernameHint: string | null;
  isUsernameHintError: boolean;
  isUsernameValid: boolean;
  nip05VerifyStatus: Nip05VerifyStatus;
}

export interface ProfileEditorFieldActions {
  setUsername: (value: string) => void;
  setDisplayName: (value: string) => void;
  setPicture: (value: string) => void;
  setNip05: (value: string) => void;
  setAbout: (value: string) => void;
}

const NIP05_VERIFY_DEBOUNCE_MS = 800;

export function useProfileEditor({
  userPubkey,
  knownProfileNames = [],
  t,
  updateUserProfile,
  publishEvent,
  validateNip05,
  onSaved,
}: UseProfileEditorOptions) {
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [picture, setPicture] = useState("");
  const [nip05, setNip05] = useState("");
  const [about, setAbout] = useState("");
  const [isUsernameAutoFilled, setIsUsernameAutoFilled] = useState(false);
  const [nip05VerifyStatus, setNip05VerifyStatus] = useState<Nip05VerifyStatus>("idle");
  const nip05VerifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nip05VerifySeqRef = useRef(0);
  const [initialProfileSnapshot, setInitialProfileSnapshot] = useState<Required<ProfileEditorSnapshot>>({
    name: "",
    displayName: "",
    picture: "",
    nip05: "",
    about: "",
  });
  const presencePublishingEnabled = usePreferencesStore(s => s.presencePublishingEnabled);
  const publishDelayEnabled = usePreferencesStore(s => s.publishDelayEnabled);
  const autoCaptionEnabled = usePreferencesStore(s => s.autoCaptionEnabled);
  const setPresencePublishingEnabled = usePreferencesStore(s => s.setPresencePublishingEnabled);
  const setPublishDelayEnabled = usePreferencesStore(s => s.setPublishDelayEnabled);
  const setAutoCaptionEnabled = usePreferencesStore(s => s.setAutoCaptionEnabled);

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
    ? t("auth.profile.nameRequired")
    : showUsernameInvalid
      ? t("auth.profile.nameInvalidNip05")
      : showUsernameTaken
        ? t("auth.profile.nameTaken")
        : null;
  const isUsernameHintError = Boolean(usernameHint);

  useEffect(() => {
    if (nip05VerifyTimerRef.current) clearTimeout(nip05VerifyTimerRef.current);
    const trimmed = nip05.trim();
    if (!trimmed || !validateNip05) {
      setNip05VerifyStatus("idle");
      return;
    }
    setNip05VerifyStatus("verifying");
    const seq = ++nip05VerifySeqRef.current;
    nip05VerifyTimerRef.current = setTimeout(() => {
      validateNip05(trimmed).then((result) => {
        if (seq !== nip05VerifySeqRef.current) return;
        if (result === true) setNip05VerifyStatus("verified");
        else if (result === false) setNip05VerifyStatus("invalid");
        else setNip05VerifyStatus("error");
      }).catch(() => {
        if (seq !== nip05VerifySeqRef.current) return;
        setNip05VerifyStatus("error");
      });
    }, NIP05_VERIFY_DEBOUNCE_MS);
    return () => {
      if (nip05VerifyTimerRef.current) clearTimeout(nip05VerifyTimerRef.current);
    };
  }, [nip05, validateNip05]);

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
    setNip05VerifyStatus("idle");
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
  };

  const handleAutoCaptionChange = (enabled: boolean) => {
    setAutoCaptionEnabled(enabled);
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
      toast.error(t("auth.profile.nameRequired"));
      return false;
    }
    if (!isUsernameValid) {
      toast.error(showUsernameTaken
        ? t("auth.profile.nameTaken")
        : t("auth.profile.nameInvalidNip05"));
      return false;
    }
    if (nip05.trim() && nip05VerifyStatus !== "verified") {
      toast.error(t("auth.profile.nip05VerifyBlocksSave"));
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
        toast.success(t("auth.profile.updated"));
        onSaved?.();
      } else {
        toast.error(t("auth.profile.updateFailed"));
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
      nip05VerifyStatus,
    }),
    [
      isUsernameHintError,
      isUsernameValid,
      usernameHint,
      nip05VerifyStatus,
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
