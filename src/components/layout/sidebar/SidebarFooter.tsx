import { BookOpen, Keyboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

/** Utility tiles at the bottom of the desktop sidebar (shortcuts help, guide). */
export function SidebarFooter() {
  const { t } = useTranslation("shell");
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  return (
    <div className="border-t border-sidebar-border flex-shrink-0 p-2">
      <div className="flex w-full flex-col gap-1 lg:flex-row lg:gap-2">
        <button
          onClick={() => {
            void dispatchFeedInteraction({ type: "ui.openShortcutsHelp" });
          }}
          className="hidden h-8 w-full items-center justify-start gap-2 rounded-none bg-transparent px-1.5 text-muted-foreground transition-colors hover:text-foreground lg:inline-flex lg:w-auto lg:flex-1"
          title={t("sidebar.actions.openShortcuts")}
        >
          <Keyboard className="w-4 h-4" />
          <span className="text-xs font-medium">{t("sidebar.actions.shortcuts")}</span>
        </button>

        <button
          onClick={() => {
            void dispatchFeedInteraction({ type: "ui.openGuide" });
          }}
          className="inline-flex h-8 w-full items-center justify-start gap-2 rounded-none bg-transparent px-1.5 text-muted-foreground transition-colors hover:text-foreground lg:w-auto lg:flex-1"
          title={t("sidebar.actions.openGuide")}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-xs font-medium">{t("sidebar.actions.guide")}</span>
        </button>
      </div>
    </div>
  );
}
