import { Plus, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Relay } from "@/types";
import { RelayItem } from "./RelayItem";
import { SidebarSection } from "./SidebarSection";
import type { SidebarFocusableItem } from "./use-sidebar-keyboard-nav";
import { RelayManagement } from "@/components/relay/RelayManagement";
import { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarRelaysSectionProps {
  relays: Relay[];
  nostrRelays: NDKRelayStatus[];
  isExpanded: boolean;
  onToggle: () => void;
  focusedItem: SidebarFocusableItem | null;
}

/** The Feeds/Relays sidebar section with its add-relay management action. */
export function SidebarRelaysSection({
  relays,
  nostrRelays,
  isExpanded,
  onToggle,
  focusedItem,
}: SidebarRelaysSectionProps) {
  const { t } = useTranslation("shell");

  return (
    <SidebarSection
      dataOnboarding="relays-section"
      title={t("sidebar.sections.feeds")}
      icon={Radio}
      isExpanded={isExpanded}
      animationMode="fullCollapse"
      onToggle={onToggle}
      iconIntent="sidebar.relay.toggleAll"
      iconLabel={t("sidebar.actions.toggleAllConnectedSpaces")}
      hint={t("sidebar.hints.relays")}
      action={
        <TooltipProvider>
          <Tooltip>
            <RelayManagement
              relays={nostrRelays}
              trigger={
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    title={t("sidebar.actions.addRelay")}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
              }
            />
            <TooltipContent side="right">
              <p>{t("sidebar.actions.addRelay")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      }
    >
      {relays.map((relay) => (
        <RelayItem
          key={relay.id}
          relay={relay}
          isKeyboardFocused={focusedItem?.type === "relay" && focusedItem?.id === relay.id}
        />
      ))}
    </SidebarSection>
  );
}
