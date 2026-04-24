import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { TFunction } from "i18next";
import { isValidNoasBaseUrl } from "@/lib/nostr/noas-discovery";
import { resolveNoasHostDisplayValue } from "./noas-form-helpers";

export function validateNoasUsername(username: string, t: TFunction): string | null {
  const trimmedUsername = username.trim();

  if (!trimmedUsername) {
    return t("auth.errors.usernameRequired");
  }

  if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
    return t("auth.errors.usernameLength");
  }

  if (!/^[a-z0-9_-]+$/.test(trimmedUsername)) {
    return t("auth.errors.usernameFormat");
  }

  return null;
}

export function validateNoasBaseUrl(value: string, t: TFunction): string | null {
  if (!value.trim()) {
    return t("auth.errors.noasHostRequired");
  }

  if (!isValidNoasBaseUrl(value)) {
    return t("auth.errors.noasHostInvalid");
  }

  return null;
}

interface NoasSharedFieldsProps {
  t: TFunction;
  username: string;
  password: string;
  noasHostUrl: string;
  isEditingHostUrl: boolean;
  allowDirectHostEdit?: boolean;
  isLoading: boolean;
  showUsernameHint?: boolean;
  passwordAutoComplete: "current-password" | "new-password";
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNoasHostUrlChange?: (value: string) => void;
  onToggleHostEdit: () => void;
}

export function NoasSharedFields({
  t,
  username,
  password,
  noasHostUrl,
  isEditingHostUrl,
  allowDirectHostEdit = false,
  isLoading,
  showUsernameHint = false,
  passwordAutoComplete,
  onUsernameChange,
  onPasswordChange,
  onNoasHostUrlChange,
  onToggleHostEdit,
}: NoasSharedFieldsProps) {
  void isEditingHostUrl;
  void onNoasHostUrlChange;
  void onToggleHostEdit;

  const usernamePlaceholder = allowDirectHostEdit
    ? t("auth.noas.fullHandlePlaceholder")
    : t("auth.usernamePlaceholder");
  const defaultHostSuffix = username.includes("@") ? "" : resolveNoasHostDisplayValue(noasHostUrl);
  const usernameSuffixMeasureValue = username || usernamePlaceholder;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="noas-username">{t("auth.username")}</Label>
        <div className={showUsernameHint ? "space-y-1 min-w-0" : "min-w-0"}>
          <div className="relative">
            {defaultHostSuffix ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 text-base md:text-sm"
              >
                <span className="invisible whitespace-pre">{usernameSuffixMeasureValue}</span>
                <span
                  data-testid="noas-username-suffix"
                  className="whitespace-pre text-muted-foreground/70"
                >
                  @{defaultHostSuffix}
                </span>
              </div>
            ) : null}
            <Input
              id="noas-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value.toLowerCase())}
              placeholder={usernamePlaceholder}
              disabled={isLoading}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`h-10 ${defaultHostSuffix ? "bg-transparent" : ""}`}
            />
          </div>
          {showUsernameHint ? (
            <p className="text-xs text-muted-foreground">
              {allowDirectHostEdit ? t("auth.noas.fullHandleHint") : t("auth.noas.usernameHint")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="noas-password">{t("auth.password")}</Label>
        <Input
          id="noas-password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={t("auth.passwordPlaceholder")}
          disabled={isLoading}
          autoComplete={passwordAutoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{t("auth.noas.passwordHint")}</p>
      </div>
    </>
  );
}
