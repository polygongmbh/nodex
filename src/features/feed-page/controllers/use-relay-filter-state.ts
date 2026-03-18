import { useEffect, useMemo, useState } from "react";
import { TFunction } from "i18next";
import { toast } from "sonner";
import { Relay } from "@/types";
import { getEffectiveActiveRelayIds } from "@/domain/preferences/filter-state";
import {
  loadPersistedRelayIds,
  savePersistedRelayIds,
} from "@/infrastructure/preferences/filter-preferences-storage";

interface UseRelayFilterStateOptions {
  relays: Relay[];
  t: TFunction;
  onRelayEnabled?: (relay: Relay) => void;
}

export function useRelayFilterState({ relays, t, onRelayEnabled }: UseRelayFilterStateOptions) {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(() =>
    loadPersistedRelayIds()
  );

  useEffect(() => {
    savePersistedRelayIds(activeRelayIds);
  }, [activeRelayIds]);

  const handleRelayToggle = (id: string) => {
    const relay = relays.find((r) => r.id === id);
    setActiveRelayIds((prev) => {
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
      toast(
        isEnabled
          ? t("toasts.success.relayFilterDisabled", { relayName: relay?.name || id })
          : t("toasts.success.relayFilterEnabled", { relayName: relay?.name || id })
      );
      return next;
    });
  };

  const handleRelayExclusive = (id: string) => {
    const relay = relays.find((r) => r.id === id);
    setActiveRelayIds((prev) => {
      if (prev.size === 1 && prev.has(id)) {
        toast(t("toasts.success.relayFilterDisabled", { relayName: relay?.name || id }));
        return new Set();
      }

      if (relay) {
        onRelayEnabled?.(relay);
      }
      toast(t("toasts.success.showingOnlyRelay", { relayName: relay?.name || id }));
      return new Set([id]);
    });
  };

  const handleToggleAllRelays = () => {
    setActiveRelayIds((prev) => {
      const connectedRelays = relays.filter(
        (r) => r.connectionStatus === "connected" || r.connectionStatus === "read-only"
      );

      if (connectedRelays.length === 0) {
        return prev;
      }

      const allConnectedActive =
        connectedRelays.length > 0 && connectedRelays.every((r) => prev.has(r.id));

      if (allConnectedActive) {
        toast(t("toasts.success.relayFiltersCleared"));
        return new Set();
      }

      connectedRelays.forEach((relay) => {
        if (!prev.has(relay.id)) {
          onRelayEnabled?.(relay);
        }
      });
      toast(t("toasts.success.allRelaysSelected"));
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
