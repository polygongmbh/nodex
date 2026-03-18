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

function getRelayDomain(relay: Relay | undefined, fallbackId: string): string {
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

export function useRelayFilterState({ relays, t, onRelayEnabled }: UseRelayFilterStateOptions) {
  const [activeRelayIds, setActiveRelayIds] = useState<Set<string>>(() =>
    loadPersistedRelayIds()
  );

  useEffect(() => {
    savePersistedRelayIds(activeRelayIds);
  }, [activeRelayIds]);

  const handleRelayToggle = (id: string) => {
    const relay = relays.find((r) => r.id === id);
    const relayDomain = getRelayDomain(relay, id);
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
          ? t("toasts.success.relayFilterDisabled", { relayDomain })
          : t("toasts.success.relayFilterEnabled", { relayDomain })
      );
      return next;
    });
  };

  const handleRelayExclusive = (id: string) => {
    const relay = relays.find((r) => r.id === id);
    const relayDomain = getRelayDomain(relay, id);
    setActiveRelayIds((prev) => {
      if (prev.size === 1 && prev.has(id)) {
        toast(t("toasts.success.relayFilterDisabled", { relayDomain }));
        return new Set();
      }

      if (relay) {
        onRelayEnabled?.(relay);
      }
      toast(t("toasts.success.showingOnlyRelay", { relayDomain }));
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
