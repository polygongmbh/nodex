import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { featureDebugLog } from "@/lib/feature-debug";
import { getMotdDismissStorageKey, resolveMotd } from "@/lib/motd";

function loadDismissedMotd(motd: string): boolean {
  try {
    return sessionStorage.getItem(getMotdDismissStorageKey(motd)) === "1";
  } catch {
    return false;
  }
}

function saveDismissedMotd(motd: string): void {
  try {
    sessionStorage.setItem(getMotdDismissStorageKey(motd), "1");
  } catch {
    // Ignore session storage failures in restricted/private browsing modes.
  }
}

export function MotdBanner() {
  const { t } = useTranslation();
  const motd = useMemo(() => resolveMotd(), []);
  const [dismissed, setDismissed] = useState(() => (motd ? loadDismissedMotd(motd) : false));
  const isVisible = Boolean(motd) && !dismissed;

  useEffect(() => {
    featureDebugLog("motd", isVisible ? "Showing MOTD banner" : "MOTD banner hidden", {
      configured: Boolean(motd),
      dismissed,
      length: motd?.length,
    });
  }, [dismissed, isVisible, motd]);

  if (!isVisible || !motd) return null;

  return (
    <div className="border-b border-amber-500/25 bg-amber-100/70 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-100">
      <div className="mx-auto flex w-full max-w-screen-2xl items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-medium">
          {motd}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-amber-900 hover:bg-amber-200/70 hover:text-amber-950 dark:text-amber-100 dark:hover:bg-amber-700/30"
          onClick={() => {
            saveDismissedMotd(motd);
            setDismissed(true);
            featureDebugLog("motd", "Dismissed MOTD banner");
          }}
          aria-label={t("motd.dismiss")}
          title={t("motd.dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
