import { useTranslation } from "react-i18next";
import type { ChannelMatchMode } from "@/types";
import { cn } from "@/lib/utils";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface ChannelMatchModeToggleProps {
  mode: ChannelMatchMode;
  onChange?: (mode: ChannelMatchMode) => void;
  size?: "sidebar" | "mobile";
  className?: string;
}

export function ChannelMatchModeToggle({
  mode,
  onChange,
  size = "sidebar",
  className,
}: ChannelMatchModeToggleProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const isSidebar = size === "sidebar";

  return (
    <button
      type="button"
      onClick={() => {
        const nextMode = mode === "and" ? "or" : "and";
        if (onChange) {
          onChange(nextMode);
          return;
        }
        void dispatchFeedInteraction({ type: "sidebar.channel.matchMode.change", mode: nextMode });
      }}
      className={cn(
        "relative inline-flex items-center rounded-full border border-border/90 bg-muted/50",
        isSidebar ? "h-5 w-11 shrink-0 lg:h-6 lg:w-16" : "h-8 w-24",
        className
      )}
      aria-label={t("filters.channels.matchMode")}
      title={t("filters.channels.matchMode")}
      aria-pressed={mode === "or"}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute rounded-full bg-primary ring-1 ring-primary/50 shadow-md transition-all duration-200",
          isSidebar
            ? cn(
                "top-0.5 bottom-0.5",
                mode === "and" ? "left-0.5 right-[calc(50%+1px)]" : "left-[calc(50%+1px)] right-0.5"
              )
            : cn(
                "top-1 bottom-1",
                mode === "and" ? "left-1 right-[calc(50%+2px)]" : "left-[calc(50%+2px)] right-1"
              )
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-10 grid w-1/2 place-items-center font-semibold leading-[1] tracking-wide transition-colors",
          isSidebar ? "text-[0.5rem] lg:text-[0.6rem]" : "text-[0.72rem]",
          mode === "and" ? "text-primary-foreground" : "text-muted-foreground"
        )}
      >
        {t("filters.channels.modeAnd")}
      </span>
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-10 grid w-1/2 place-items-center font-semibold leading-[1] tracking-wide transition-colors",
          isSidebar ? "text-[0.5rem] lg:text-[0.6rem]" : "text-[0.72rem]",
          mode === "or" ? "text-primary-foreground" : "text-muted-foreground"
        )}
      >
        {t("filters.channels.modeOr")}
      </span>
    </button>
  );
}
