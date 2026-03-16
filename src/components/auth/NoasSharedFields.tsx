import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { TFunction } from "i18next";
import { isValidNoasBaseUrl, normalizeNoasBaseUrl } from "@/lib/nostr/noas-client";

export function validateNoasUsername(username: string, t: TFunction): string | null {
  const trimmedUsername = username.trim();

  if (!trimmedUsername) {
    return t("auth.errors.usernameRequired");
  }

  if (trimmedUsername.length < 3 || trimmedUsername.length > 32) {
    return t("auth.errors.usernameLength");
  }

  if (!/^[a-z0-9_]+$/.test(trimmedUsername)) {
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
  const hostReadOnly = allowDirectHostEdit ? false : !isEditingHostUrl;
  const hostValue = noasHostUrl;
  const normalizedPlaceholder = normalizeNoasBaseUrl("noas.example.com");

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="noas-username">{t("auth.username")}</Label>
        <div className="grid items-start gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className={showUsernameHint ? "space-y-1 min-w-0" : "min-w-0"}>
            <Input
              id="noas-username"
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value.toLowerCase())}
              placeholder={t("auth.usernamePlaceholder")}
              disabled={isLoading}
              autoComplete="username"
              className="h-10"
            />
            {showUsernameHint ? (
              <p className="text-xs text-muted-foreground">{t("auth.noas.usernameHint")}</p>
            ) : null}
          </div>
          <div
            className="hidden h-10 items-center justify-center text-sm font-medium text-muted-foreground md:flex"
            aria-hidden="true"
          >
            @
          </div>
          <div className="space-y-1 min-w-0">
            <div className="relative">
              <Input
                value={hostValue}
                readOnly={hostReadOnly}
                onChange={(e) => onNoasHostUrlChange?.(e.target.value)}
                aria-label={t("auth.noas.host")}
                placeholder={normalizedPlaceholder}
                title={hostValue || undefined}
                className={`h-10 text-sm ${allowDirectHostEdit ? "" : "pr-10"} ${
                  hostReadOnly ? "text-muted-foreground" : "text-foreground"
                }`}
              />
              {allowDirectHostEdit ? null : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onToggleHostEdit}
                        disabled={isLoading}
                        aria-pressed={isEditingHostUrl}
                        aria-label={t("auth.noas.editHost")}
                        className="absolute right-1 top-1 h-8 w-8 px-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("auth.noas.editHostWarning")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {allowDirectHostEdit ? null : (
              <p className="text-[11px] leading-none text-muted-foreground whitespace-nowrap">
                {t("auth.noas.hostHint")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="noas-password">{t("auth.password")}</Label>
        <Input
          id="noas-password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={t("auth.passwordPlaceholder")}
          disabled={isLoading}
          autoComplete={passwordAutoComplete}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{t("auth.noas.passwordHint")}</p>
      </div>
    </>
  );
}
