import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import type { TFunction } from "i18next";

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

interface NoasSharedFieldsProps {
  t: TFunction;
  username: string;
  password: string;
  noasHostUrl: string;
  isEditingHostUrl: boolean;
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
  isLoading,
  showUsernameHint = false,
  passwordAutoComplete,
  onUsernameChange,
  onPasswordChange,
  onNoasHostUrlChange,
  onToggleHostEdit,
}: NoasSharedFieldsProps) {
  const parsedNoasUrl = (() => {
    try {
      return new URL(noasHostUrl);
    } catch {
      return null;
    }
  })();

  const displayedHost = parsedNoasUrl?.host || "noas.example.com";

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="noas-username">{t("auth.username")}</Label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_11rem] items-start gap-2">
          <div className={showUsernameHint ? "space-y-1" : undefined}>
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
          <div className="flex h-10 items-center justify-center text-sm font-medium text-muted-foreground" aria-hidden="true">
            @
          </div>
          <div className="space-y-1">
            <div className="relative">
              <Input
                value={displayedHost}
                readOnly={!isEditingHostUrl}
                onChange={(e) => onNoasHostUrlChange?.(`${parsedNoasUrl?.protocol || "https:"}//${e.target.value}`)}
                aria-label={t("auth.noas.host")}
                className={`h-10 pr-10 text-sm ${
                  isEditingHostUrl ? "text-foreground" : "text-muted-foreground"
                }`}
              />
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
            </div>
            <p className="text-[11px] leading-none text-muted-foreground whitespace-nowrap">
              {t("auth.noas.hostHint")}
            </p>
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
