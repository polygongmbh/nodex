import { Bookmark, EllipsisVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SavedFilterConfiguration } from "@/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface SavedFilterPresetRowProps {
  configurations: SavedFilterConfiguration[];
  activeConfigurationId?: string | null;
  className?: string;
}

export function SavedFilterPresetRow({
  configurations,
  activeConfigurationId = null,
  className,
}: SavedFilterPresetRowProps) {
  const { t } = useTranslation("composer");
  const dispatchFeedInteraction = useFeedInteractionDispatch();

  const promptAndSaveCurrent = () => {
    const initialName = `Preset ${configurations.length + 1}`;
    const name = window.prompt(t("composer.savedFilters.prompts.save"), initialName);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    void dispatchFeedInteraction({ type: "sidebar.savedFilter.saveCurrent", name: trimmed });
  };

  const promptAndRename = (configuration: SavedFilterConfiguration) => {
    const name = window.prompt(t("composer.savedFilters.prompts.rename"), configuration.name);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    void dispatchFeedInteraction({
      type: "sidebar.savedFilter.rename",
      configurationId: configuration.id,
      name: trimmed,
    });
  };

  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-1", className)}>
      <button
        type="button"
        onClick={promptAndSaveCurrent}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-primary/40 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <Bookmark className="h-3.5 w-3.5" />
        <span>{t("composer.savedFilters.actions.saveCurrent")}</span>
      </button>
      {configurations.map((configuration) => {
        const isActive = configuration.id === activeConfigurationId;
        return (
          <div
            key={configuration.id}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full border pl-2 pr-1",
              isActive
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/60 bg-muted/40 text-muted-foreground"
            )}
          >
            <button
              type="button"
              onClick={() => {
                void dispatchFeedInteraction({
                  type: "sidebar.savedFilter.apply",
                  configurationId: configuration.id,
                });
              }}
              className="inline-flex items-center rounded-full px-2 text-xs font-medium hover:text-foreground"
              title={configuration.name}
            >
              {configuration.name}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("composer.savedFilters.actions.menu")}
                  className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                >
                  <EllipsisVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onSelect={() => promptAndRename(configuration)}>
                  {t("composer.savedFilters.actions.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    void dispatchFeedInteraction({
                      type: "sidebar.savedFilter.delete",
                      configurationId: configuration.id,
                    });
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  {t("composer.savedFilters.actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
