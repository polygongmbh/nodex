import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProfileEditorFields } from "@/components/auth/ProfileEditorFields";
import { useProfileEditor } from "@/hooks/use-profile-editor";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { useFeedViewState } from "@/features/feed-page/views/feed-view-state-context";
import { markProfileCompletionPromptShown } from "@/lib/profile-completion-prompt-state";
import type { TFunction } from "i18next";

/**
 * Global profile completion dialog. Listens to the feed-layer
 * profileCompletionPromptSignal and pops a profile editor regardless of route
 * or platform. Same UX on mobile and desktop. Shown at most once per pubkey
 * (tracked in localStorage) so resuming a session does not reopen it.
 */
export function ProfileCompletionDialog() {
  const { t } = useTranslation(["auth", "filters"]);
  const translate = ((key: string, values?: Record<string, unknown>) => {
    if (key.startsWith("auth.")) return t(`auth:${key}`, values);
    return t(key, values);
  }) as TFunction;

  const { user, hasWritableRelayConnection, needsProfileSetup, updateUserProfile, publishEvent } = useNDK();
  const { profileCompletionPromptSignal } = useFeedViewState();

  const [isOpen, setIsOpen] = useState(false);
  const lastHandledSignalRef = useRef(0);

  const effectiveProfile = useMemo(() => user?.profile ?? {}, [user?.profile]);
  const {
    fields,
    fieldActions,
    isProfileDirty,
    isSavingProfile,
    validation,
    resetFromProfile,
    handleSaveProfile,
  } = useProfileEditor({
    userPubkey: user?.pubkey,
    t: translate,
    updateUserProfile,
    publishEvent,
    onSaved: () => {
      if (user?.pubkey) markProfileCompletionPromptShown(user.pubkey);
      setIsOpen(false);
    },
  });
  const { isUsernameValid } = validation;

  useEffect(() => {
    if (profileCompletionPromptSignal <= 0 || !user) return;
    if (profileCompletionPromptSignal === lastHandledSignalRef.current) return;
    if (!hasWritableRelayConnection) return;
    lastHandledSignalRef.current = profileCompletionPromptSignal;
    resetFromProfile(effectiveProfile);
    if (user.pubkey) markProfileCompletionPromptShown(user.pubkey);
    setIsOpen(true);
  }, [profileCompletionPromptSignal, user, hasWritableRelayConnection, effectiveProfile, resetFromProfile, t]);

  if (!user) return null;

  const canDismiss = !needsProfileSetup;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !canDismiss) return;
        setIsOpen(open);
      }}
    >
      <DialogContent
        showCloseButton={canDismiss}
        dismissOnOutsideInteract={canDismiss && !isProfileDirty}
        className="w-[calc(100%-1rem)] max-h-[calc(100dvh-1rem)] p-0 sm:max-w-lg"
      >
        <div className="flex max-h-[calc(100dvh-1rem)] flex-col p-4 sm:p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {t("auth:auth.menu.profileSetupTitle")}
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
              t={translate}
            />
          </DialogScrollBody>
          <div className="mt-3 flex shrink-0 justify-end gap-2 bg-background/95 pt-2">
            {canDismiss && (
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
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
  );
}
