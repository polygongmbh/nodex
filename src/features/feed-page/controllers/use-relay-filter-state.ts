import { useEffect, useMemo, useRef, useState } from "react";
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
  defaultRelayIds: string[];
  onRelayEnabled?: (relay: Relay) => void;
}

export function useRelayFilterState({ relays, t, defaultRelayIds, onRelayEnabled }: UseRelayFilterStateOptions) {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(() =>
    loadPersistedRelayIds(defaultRelayIds)
  );
  const didAutoInitializeRef = useRef(false);

  useEffect(() => {
    savePersistedRelayIds(activeRelayIds);
  }, [activeRelayIds]);

  useEffect(() => {
    if (didAutoInitializeRef.current) return;
    if (relays.length === 0) return;

    const availableRelayIds = new Set(relays.map((relay) => relay.id));
    const hasMatchingSelection = Array.from(activeRelayIds).some((relayId) => availableRelayIds.has(relayId));
    if (hasMatchingSelection) {
      didAutoInitializeRef.current = true;
      return;
    }

    didAutoInitializeRef.current = true;
    setActiveRelayIds(new Set(relays.map((relay) => relay.id)));
  }, [activeRelayIds, relays]);

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
