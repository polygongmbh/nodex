import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileEditorFieldActions, ProfileEditorValidation } from "@/hooks/use-profile-editor";

interface ProfileEditorFieldsProps {
  fields: {
    username: string;
    displayName: string;
    picture: string;
    nip05: string;
    about: string;
  };
  validation: Pick<ProfileEditorValidation, "usernameHint" | "isUsernameHintError">;
  fieldActions: ProfileEditorFieldActions;
  t: (key: string) => string;
}

export function ProfileEditorFields({
  fields,
  validation,
  fieldActions,
  t,
}: ProfileEditorFieldsProps) {
  const {
    username,
    displayName,
    picture,
    nip05,
    about,
  } = fields;
  const { usernameHint, isUsernameHintError } = validation;
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

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={displayNameId}>
          {t("filters.profile.displayName")}
        </Label>
        <Input
          id={displayNameId}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("filters.profile.displayNamePlaceholder")}
          className="text-sm"
        />
      </div>

      <div>
        <Label htmlFor={nameId}>
          {t("filters.profile.name")}
        </Label>
        <Input
          id={nameId}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t("filters.profile.namePlaceholder")}
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
          {t("filters.profile.picture")}
        </Label>
        <Input
          id={pictureId}
          value={picture}
          onChange={(e) => setPicture(e.target.value)}
          placeholder={t("filters.profile.picturePlaceholder")}
          className="text-sm"
        />
      </div>

      <div>
        <Label htmlFor={nip05Id}>
          {t("filters.profile.nip05")}
        </Label>
        <Input
          id={nip05Id}
          value={nip05}
          onChange={(e) => setNip05(e.target.value)}
          placeholder={t("filters.profile.nip05Placeholder")}
          className="text-sm"
        />
      </div>

      <div>
        <Label htmlFor={aboutId}>
          {t("filters.profile.about")}
        </Label>
        <Textarea
          id={aboutId}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder={t("filters.profile.aboutPlaceholder")}
          rows={4}
          className="text-sm"
        />
      </div>
    </div>
  );
}
