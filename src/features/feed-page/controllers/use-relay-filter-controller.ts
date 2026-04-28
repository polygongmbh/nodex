import { useMemo } from "react";
import { toast } from "sonner";
import i18n from "@/lib/i18n/config";
import { Relay } from "@/types";
import { getEffectiveActiveRelayIds } from "@/domain/preferences/filter-state";
import {
  notifyRelayFilterDisabled,
  notifyRelayFilterEnabled,
  notifyShowingOnlyRelay,
  notifyRelayFiltersCleared,
  notifyAllRelaysSelected,
} from "@/lib/notifications";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";

interface UseRelayFilterControllerOptions {
  relays: Relay[];
  onRelayEnabled?: (relay: Relay) => void;
  getEnableToastMessage?: (
    relay: Relay,
    context: { mode: "toggle" | "exclusive" | "all" }
  ) => string | null | undefined;
}

export function getRelayDomain(relay: Relay | undefined, fallbackId: string): string {
  const relayUrl = relay?.url?.trim();
  if (relayUrl) {
    try {
      return new URL(relayUrl).host;
    } catch {
      const normalized = relayUrl.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
      if (normalized) return normalized;
    }
  }

  const relayName = relay?.name?.trim();
  if (relayName) return relayName;
  return fallbackId;
}

export function useRelayFilterController({
  relays,
  onRelayEnabled,
  getEnableToastMessage,
}: UseRelayFilterControllerOptions) {
  const activeRelayIds = useFilterStore((s) => s.activeRelayIds);
  const setActiveRelayIds = useFilterStore((s) => s.setActiveRelayIds);

  const handleRelayToggle = (id: string) => {
    const relay = relays.find((r) => r.id === id);
    const relayDomain = getRelayDomain(relay, id);
    setActiveRelayIds((prev) => {
      const previousSnapshot = new Set(prev);
      const restoreSnapshot = () => setActiveRelayIds(new Set(previousSnapshot));
      const next = new Set(prev);
      const isEnabled = next.has(id);
      if (isEnabled) {
        next.delete(id);
      } else {
        next.add(id);
        if (relay) {
          onRelayEnabled?.(relay);
        }
      }
      if (isEnabled) {
        notifyRelayFilterDisabled(relayDomain, { onUndo: restoreSnapshot });
      } else {
        const enabledToastMessage = relay
          ? getEnableToastMessage?.(relay, { mode: "toggle" })
          : undefined;
        if (enabledToastMessage !== null) {
          if (typeof enabledToastMessage === "string") {
            toast(enabledToastMessage, {
              action: { label: i18n.t("composer:toasts.actions.undo"), onClick: restoreSnapshot },
            });
          } else {
            notifyRelayFilterEnabled(relayDomain, { onUndo: restoreSnapshot });
          }
        }
      }
      return next;
    });
  };

  const handleRelayExclusive = (id: string) => {
    const relay = relays.find((r) => r.id === id);
    const relayDomain = getRelayDomain(relay, id);
    setActiveRelayIds((prev) => {
      const previousSnapshot = new Set(prev);
      const restoreSnapshot = () => setActiveRelayIds(new Set(previousSnapshot));
      if (prev.size === 1 && prev.has(id)) {
        notifyRelayFilterDisabled(relayDomain, { onUndo: restoreSnapshot });
        return new Set();
      }

      if (relay) {
        onRelayEnabled?.(relay);
      }
      const enabledToastMessage = relay
        ? getEnableToastMessage?.(relay, { mode: "exclusive" })
        : undefined;
      if (enabledToastMessage !== null) {
        if (typeof enabledToastMessage === "string") {
          toast(enabledToastMessage, {
            action: { label: i18n.t("composer:toasts.actions.undo"), onClick: restoreSnapshot },
          });
        } else {
          notifyShowingOnlyRelay(relayDomain, { onUndo: restoreSnapshot });
        }
      }
      return new Set([id]);
    });
  };

  const handleToggleAllRelays = () => {
    setActiveRelayIds((prev) => {
      const previousSnapshot = new Set(prev);
      const restoreSnapshot = () => setActiveRelayIds(new Set(previousSnapshot));
      const connectedRelays = relays.filter(
        (r) => r.connectionStatus === "connected" || r.connectionStatus === "read-only"
      );

      if (connectedRelays.length === 0) {
        return prev;
      }

      const allConnectedActive =
        connectedRelays.length > 0 && connectedRelays.every((r) => prev.has(r.id));

      if (allConnectedActive) {
        notifyRelayFiltersCleared({ onUndo: restoreSnapshot });
        return new Set();
      }

      connectedRelays.forEach((relay) => {
        if (!prev.has(relay.id)) {
          onRelayEnabled?.(relay);
        }
      });
      notifyAllRelaysSelected({ onUndo: restoreSnapshot });
      return new Set(connectedRelays.map((r) => r.id));
    });
  };

  const effectiveActiveRelayIds = useMemo(
    () => getEffectiveActiveRelayIds(activeRelayIds, relays.map((relay) => relay.id)),
    [activeRelayIds, relays]
  );

  return {
    activeRelayIds,
    setActiveRelayIds,
    effectiveActiveRelayIds,
    handleRelayToggle,
    handleRelayExclusive,
    handleToggleAllRelays,
  };
}
