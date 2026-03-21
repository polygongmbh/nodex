import { Copy, Eye, EyeOff, Key } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface GuestPrivateKeyRowProps {
  value: string;
  showKey: boolean;
  onToggleShow: () => void;
  onCopy: () => void;
}

export function GuestPrivateKeyRow({
  value,
  showKey,
  onToggleShow,
  onCopy,
}: GuestPrivateKeyRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        className="inline-flex shrink-0 items-center gap-1.5 font-medium"
        title={t("auth.menu.keepSecret")}
      >
        <Key className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-[8rem] truncate sm:max-w-none">{t("auth.menu.backupPrivateKey")}</span>
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <code
          className="block min-w-0 flex-1 overflow-x-auto rounded-sm bg-muted px-1.5 py-1 text-[11px] font-mono whitespace-nowrap"
          title={t("auth.menu.keepSecret")}
        >
          {showKey ? value : "••••••••••••••••••••••••••••••••"}
        </code>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleShow}
            aria-label={showKey ? t("filters.profile.hidePrivateKey") : t("filters.profile.showPrivateKey")}
            className="h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCopy}
            aria-label={t("filters.profile.copyPrivateKey")}
            className="h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
