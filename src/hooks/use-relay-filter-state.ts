import { useEffect, useMemo, useState } from "react";
import { TFunction } from "i18next";
import { toast } from "sonner";
import { Relay } from "@/types";
import {
  getEffectiveActiveRelayIds,
  loadPersistedRelayIds,
  savePersistedRelayIds,
} from "@/lib/filter-preferences";

interface UseRelayFilterStateOptions {
  relays: Relay[];
  t: TFunction;
  defaultRelayIds: string[];
  onRelayEnabled?: (relay: Relay) => void;
}

export function useRelayFilterState({ relays, t, defaultRelayIds, onRelayEnabled }: UseRelayFilterStateOptions) {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(() =>
    loadPersistedRelayIds(defaultRelayIds)
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
    setActiveRelayIds(new Set([id]));
    if (relay) {
      onRelayEnabled?.(relay);
    }
    toast(t("toasts.success.showingOnlyRelay", { relayName: relay?.name || id }));
  };

  const handleToggleAllRelays = () => {
    setActiveRelayIds((prev) => {
      if (prev.size === relays.length) {
        toast(t("toasts.success.relayFiltersCleared"));
        return new Set();
      }
      relays.forEach((relay) => {
        if (!prev.has(relay.id)) {
          onRelayEnabled?.(relay);
        }
      });
      toast(t("toasts.success.allRelaysSelected"));
      return new Set(relays.map((r) => r.id));
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
