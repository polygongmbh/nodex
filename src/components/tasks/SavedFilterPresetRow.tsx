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
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";

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
  const { t } = useTranslation("filters");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { relays, channels, people } = useFeedSurfaceState();

  const promptAndSaveCurrent = () => {
    const initialName = `Preset ${configurations.length + 1}`;
    const name = window.prompt(t("filters.savedFilters.prompts.save"), initialName);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    void dispatchFeedInteraction({ type: "sidebar.savedFilter.saveCurrent", name: trimmed });
  };

  const promptAndRename = (configuration: SavedFilterConfiguration) => {
    const name = window.prompt(t("filters.savedFilters.prompts.rename"), configuration.name);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    void dispatchFeedInteraction({
      type: "sidebar.savedFilter.rename",
      configurationId: configuration.id,
      name: trimmed,
    });
  };

  const buildConfigurationTooltip = (configuration: SavedFilterConfiguration): string => {
    const sortAlpha = (values: string[]) =>
      [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    const relayNames = sortAlpha(
      configuration.relayIds
        .map((id) => relays.find((r) => r.id === id)?.name || relays.find((r) => r.id === id)?.url || id)
    );

    const includedChannels: string[] = [];
    const excludedChannels: string[] = [];
    Object.entries(configuration.channelStates).forEach(([id, state]) => {
      const name = channels.find((c) => c.id === id)?.name || id;
      if (state === "included") includedChannels.push(name);
      else if (state === "excluded") excludedChannels.push(name);
    });

    const peopleNames = sortAlpha(
      configuration.selectedPeopleIds.map((id) => {
        const person = people.find((p) => p.pubkey === id);
        return person?.name || person?.displayName || id.slice(0, 8);
      })
    );

    const lines: string[] = [configuration.name];

    if (relayNames.length > 0) {
      lines.push(`${t("filters.savedFilters.tooltip.relays")}: ${relayNames.join(", ")}`);
    }
    if (includedChannels.length > 0) {
      const matchModeLabel =
        configuration.channelMatchMode === "or"
          ? t("filters.savedFilters.tooltip.channelsOr")
          : t("filters.savedFilters.tooltip.channelsAnd");
      lines.push(`${matchModeLabel}: ${sortAlpha(includedChannels).join(", ")}`);
    }
    if (excludedChannels.length > 0) {
      lines.push(
        `${t("filters.savedFilters.tooltip.channelsExcluded")}: ${sortAlpha(excludedChannels).join(", ")}`
      );
    }
    if (peopleNames.length > 0) {
      lines.push(`${t("filters.savedFilters.tooltip.people")}: ${peopleNames.join(", ")}`);
    }
    if (lines.length === 1) {
      lines.push(t("filters.savedFilters.tooltip.empty"));
    }
    return lines.join("\n");
  };

  const hasConfigurations = configurations.length > 0;
  const saveLabel = t("filters.savedFilters.actions.saveCurrent");
  const saveTooltip = hasConfigurations
    ? t("filters.savedFilters.actions.saveCurrentTooltip")
    : saveLabel;

  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-1", className)}>
      <button
        type="button"
        onClick={promptAndSaveCurrent}
        title={saveTooltip}
        aria-label={saveTooltip}
        className={cn(
          "inline-flex h-8 shrink-0 items-center rounded-full border border-dashed border-primary/40 bg-primary/5 text-xs font-medium text-primary transition-colors hover:bg-primary/10",
          hasConfigurations ? "w-8 justify-center px-0" : "gap-1.5 px-3"
        )}
      >
        <Bookmark className="h-3.5 w-3.5" />
        {hasConfigurations ? null : <span>{saveLabel}</span>}
      </button>
      {configurations.map((configuration) => {
        const isActive = configuration.id === activeConfigurationId;
        const tooltip = buildConfigurationTooltip(configuration);
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
              title={tooltip}
              aria-label={tooltip}
            >
              {configuration.name}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("filters.savedFilters.actions.menu")}
                  className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10"
                >
                  <EllipsisVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onSelect={() => promptAndRename(configuration)}>
                  {t("filters.savedFilters.actions.rename")}
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
                  {t("filters.savedFilters.actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
