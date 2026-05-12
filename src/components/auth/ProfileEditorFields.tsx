import { useRef, useState } from "react";
import { BadgeCheck, Camera, CircleAlert, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Nip05VerifyStatus, ProfileEditorFieldActions, ProfileEditorValidation } from "@/hooks/use-profile-editor";

interface ProfileEditorFieldsProps {
  fields: {
    username: string;
    displayName: string;
    picture: string;
    nip05: string;
    about: string;
  };
  validation: Pick<ProfileEditorValidation, "usernameHint" | "isUsernameHintError" | "nip05VerifyStatus">;
  fieldActions: ProfileEditorFieldActions;
  t: (key: string) => string;
  onNoasPictureUpload?: (file: File) => Promise<string | null>;
}

export function ProfileEditorFields({
  fields,
  validation,
  fieldActions,
  t,
  onNoasPictureUpload,
}: ProfileEditorFieldsProps) {
  const {
    username,
    displayName,
    picture,
    nip05,
    about,
  } = fields;
  const { usernameHint, isUsernameHintError, nip05VerifyStatus } = validation;
  const {
    setUsername,
    setDisplayName,
    setPicture,
    setNip05,
    setAbout,
  } = fieldActions;
  const displayNameId = "profile-display-name";
  const nameId = "profile-name";
  const nameErrorId = "profile-name-error";
  const pictureId = "profile-picture";
  const nip05Id = "profile-nip05";
  const aboutId = "profile-about";
  const showUsernameHint = Boolean(usernameHint);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onNoasPictureUpload) return;

    setIsUploading(true);
    try {
      const newUrl = await onNoasPictureUpload(file);
      if (newUrl) {
        setPicture(newUrl);
        toast.success(t("auth.profile.pictureUploaded"));
      } else {
        toast.error(t("auth.profile.pictureUploadFailed"));
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={displayNameId}>
          {t("auth.profile.displayName")}
        </Label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("auth.profile.displayNamePlaceholder")}
          className="text-sm"
        />
      </div>

      <div>
        <Label htmlFor={nameId}>
          {t("auth.profile.name")}
        </Label>
        <Input
          id={nameId}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("auth.profile.namePlaceholder")}
          className="text-sm"
          aria-invalid={isUsernameHintError}
          aria-describedby={showUsernameHint ? nameErrorId : undefined}
        />
        {showUsernameHint && (
          <p id={nameErrorId} className={isUsernameHintError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {usernameHint}
          </p>
        )}
      </div>

      <div>
        <Label htmlFor={pictureId}>
          {t("auth.profile.picture")}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={pictureId}
            value={picture}
            onChange={(e) => setPicture(e.target.value)}
            placeholder={t("auth.profile.picturePlaceholder")}
            className="text-sm flex-1"
          />
          <div className="relative shrink-0">
            <Avatar className="h-8 w-8">
              {picture ? <AvatarImage src={picture} alt="Avatar preview" /> : null}
              <AvatarFallback className="bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            {onNoasPictureUpload && (
              <>
                <button
                  type="button"
                  aria-label={t("auth.profile.uploadPicture")}
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 text-white animate-spin" />
                  ) : (
                    <Camera className="h-3 w-3 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor={nip05Id}>
          {t("auth.profile.nip05")}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={nip05Id}
            value={nip05}
            onChange={(e) => setNip05(e.target.value)}
            placeholder={t("auth.profile.nip05Placeholder")}
            className="text-sm flex-1"
          />
          <Nip05StatusIcon status={nip05VerifyStatus} />
        </div>
        <Nip05StatusHint status={nip05VerifyStatus} t={t} />
      </div>

      <div>
        <Label htmlFor={aboutId}>
          {t("auth.profile.about")}
        </Label>
        <Textarea
          id={aboutId}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder={t("auth.profile.aboutPlaceholder")}
          rows={4}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function Nip05StatusIcon({ status }: { status: Nip05VerifyStatus }) {
  if (status === "idle") return null;
  if (status === "verifying") return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
  if (status === "verified") return <BadgeCheck className="h-4 w-4 shrink-0 text-green-600" />;
  return <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />;
}

function Nip05StatusHint({ status, t }: { status: Nip05VerifyStatus; t: (key: string) => string }) {
  if (status === "verifying") return <p className="text-xs text-muted-foreground">{t("auth.profile.nip05Verifying")}</p>;
  if (status === "verified") return <p className="text-xs text-green-600">{t("auth.profile.nip05Verified")}</p>;
  if (status === "invalid") return <p className="text-xs text-destructive">{t("auth.profile.nip05VerifyFailed")}</p>;
  if (status === "error") return <p className="text-xs text-destructive">{t("auth.profile.nip05VerifyError")}</p>;
  return null;
}
