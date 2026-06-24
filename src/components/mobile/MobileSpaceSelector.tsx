import { useMemo, useState } from "react";
import { ChevronDown, Layers, Plus, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Relay } from "@/types";
import { getRelayStatusDotClass } from "@/components/relay/relayStatusStyles";
import {
  isRelayConnectionUsable,
  resolveRelayConnectionStatus,
} from "@/components/relay/relayChipStyles";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { relayUrlToName } from "@/infrastructure/nostr/relay-url";
import { resolveRelayIcon } from "@/infrastructure/nostr/relay-icon";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useFeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";

interface SpaceRowProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  statusDotClass?: string;
  onSelect: () => void;
}

function SpaceRow({ icon, label, isActive, statusDotClass, onSelect }: SpaceRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {statusDotClass ? (
        <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDotClass)} />
      ) : null}
      {isActive ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </button>
  );
}

/**
 * Compact dropdown pill (between the burger and Home chips) for picking the
 * active space (relay). The pill shows only the current space's icon; the menu
 * lists "All spaces", then connected spaces, a divider, the disconnected ones,
 * and finally an inline "connect to another space" URL field. Self-contained:
 * reads relays/active set from context+store and dispatches relay intents.
 */
export function MobileSpaceSelector() {
  const { t } = useTranslation("filters");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const { relays } = useFeedSurfaceState();
  const activeRelayIds = useFilterStore((s) => s.activeRelayIds);
  const setActiveRelayIds = useFilterStore((s) => s.setActiveRelayIds);

  const [open, setOpen] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [newUrl, setNewUrl] = useState("");

  const { connected, disconnected } = useMemo(() => {
    const connectedRelays: Relay[] = [];
    const disconnectedRelays: Relay[] = [];
    for (const relay of relays) {
      if (isRelayConnectionUsable(resolveRelayConnectionStatus(relay))) {
        connectedRelays.push(relay);
      } else {
        disconnectedRelays.push(relay);
      }
    }
    return { connected: connectedRelays, disconnected: disconnectedRelays };
  }, [relays]);

  // The pill represents a single "current" space: the sole active relay, or the
  // all-spaces state when zero (or several) are active.
  const exclusiveRelay = activeRelayIds.size === 1
    ? relays.find((relay) => activeRelayIds.has(relay.id)) ?? null
    : null;
  const TriggerIcon = exclusiveRelay ? resolveRelayIcon(exclusiveRelay.url) : Layers;

  const closeMenu = () => {
    setOpen(false);
    setShowConnect(false);
    setNewUrl("");
  };

  const selectAllSpaces = () => {
    setActiveRelayIds(() => new Set());
    closeMenu();
  };

  const selectSpace = (relayId: string) => {
    void dispatchFeedInteraction({ type: "sidebar.relay.select", relayId, mode: "exclusive" });
    closeMenu();
  };

  const connectSpace = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    void dispatchFeedInteraction({ type: "sidebar.relay.add", url: trimmed });
    closeMenu();
  };

  const renderRelayIcon = (relay: Relay) => {
    const Icon = resolveRelayIcon(relay.url);
    return <Icon className="h-4 w-4" />;
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : closeMenu())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="mobile-space-selector"
          title={t("filters.feeds.title")}
          className={cn(
            "shrink-0 flex h-9 items-center gap-0.5 rounded-full px-2.5 transition-colors duration-150",
            "bg-muted/80 dark:bg-muted/60 text-muted-foreground/80 dark:text-muted-foreground",
            "active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
        >
          <TriggerIcon className="h-[18px] w-[18px]" />
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <SpaceRow
          icon={<Layers className="h-4 w-4" />}
          label={t("filters.feeds.all")}
          isActive={activeRelayIds.size === 0}
          onSelect={selectAllSpaces}
        />

        {connected.map((relay) => (
          <SpaceRow
            key={relay.id}
            icon={renderRelayIcon(relay)}
            label={relayUrlToName(relay.url)}
            isActive={activeRelayIds.has(relay.id)}
            onSelect={() => selectSpace(relay.id)}
          />
        ))}

        {disconnected.length > 0 ? (
          <>
            <div className="my-1 h-px bg-border" />
            {disconnected.map((relay) => (
              <SpaceRow
                key={relay.id}
                icon={renderRelayIcon(relay)}
                label={relayUrlToName(relay.url)}
                isActive={activeRelayIds.has(relay.id)}
                statusDotClass={getRelayStatusDotClass(resolveRelayConnectionStatus(relay))}
                onSelect={() => selectSpace(relay.id)}
              />
            ))}
          </>
        ) : null}

        <div className="my-1 h-px bg-border" />
        {showConnect ? (
          <div className="flex items-center gap-1.5 p-1">
            <Input
              autoFocus
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                connectSpace();
              }}
              placeholder={t("filters.feeds.placeholder")}
              className="h-8"
              data-testid="mobile-space-connect-input"
            />
            <button
              type="button"
              onClick={connectSpace}
              title={t("filters.feeds.addAria")}
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-border px-2 text-sm active:bg-muted"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowConnect(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">{t("filters.feeds.connectAnother")}</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
