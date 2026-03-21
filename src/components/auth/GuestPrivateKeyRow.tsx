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
    <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1.5">
      <span className="inline-flex shrink-0 items-center gap-2 text-xs font-medium">
        <Key className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{t("auth.menu.backupPrivateKey")}</span>
      </span>
      <span className="hidden shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning sm:inline-flex">
        {t("auth.menu.keepSecret")}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <code className="block min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs font-mono whitespace-nowrap">
          {showKey ? value : "••••••••••••••••••••••••••••••••"}
        </code>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleShow}
            aria-label={showKey ? t("filters.profile.hidePrivateKey") : t("filters.profile.showPrivateKey")}
            className="h-7 w-7 rounded-md border border-border/70 p-0"
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCopy}
            aria-label={t("filters.profile.copyPrivateKey")}
            className="h-7 w-7 rounded-md border border-border/70 p-0"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
