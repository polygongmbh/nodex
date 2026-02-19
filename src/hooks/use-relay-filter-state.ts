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
}

export function useRelayFilterState({ relays, t, defaultRelayIds }: UseRelayFilterStateOptions) {
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
      }
      toast.success(
        isEnabled
          ? t("toasts.success.relayFilterDisabled", { relayName: relay?.name || id })
          : t("toasts.success.relayFilterEnabled", { relayName: relay?.name || id })
      );
      return next;
    });
  };

  const handleRelayExclusive = (id: string) => {
    setActiveRelayIds(new Set([id]));
    const relay = relays.find((r) => r.id === id);
    toast.success(t("toasts.success.showingOnlyRelay", { relayName: relay?.name || id }));
  };

  const handleToggleAllRelays = () => {
    setActiveRelayIds((prev) => {
      if (prev.size === relays.length) {
        toast.success(t("toasts.success.relayFiltersCleared"));
        return new Set();
      }
      toast.success(t("toasts.success.allRelaysSelected"));
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
