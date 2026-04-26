import { useEffect, useState } from "react";
import { type ReducedDataMode, usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { featureDebugLog } from "@/lib/feature-debug";

interface NetworkInformationLike extends EventTarget {
  saveData?: boolean;
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
};

function getBrowserReducedDataSignal(): boolean {
  if (typeof navigator === "undefined") return false;
  const networkNavigator = navigator as NavigatorWithConnection;
  return Boolean(
    networkNavigator.connection?.saveData ||
    networkNavigator.mozConnection?.saveData ||
    networkNavigator.webkitConnection?.saveData
  );
}

function getNetworkInformation(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const networkNavigator = navigator as NavigatorWithConnection;
  return networkNavigator.connection || networkNavigator.mozConnection || networkNavigator.webkitConnection;
}

export function resolveReducedDataEnabled(mode: ReducedDataMode, browserSignal = getBrowserReducedDataSignal()): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return browserSignal;
}

export function useReducedDataMode(): boolean {
  const mode = usePreferencesStore(s => s.reducedDataMode);
  const [browserSignal, setBrowserSignal] = useState(() => getBrowserReducedDataSignal());

  useEffect(() => {
    const networkInformation = getNetworkInformation();
    if (!networkInformation?.addEventListener || !networkInformation.removeEventListener) return undefined;

    const handleChange = () => {
      const nextBrowserSignal = getBrowserReducedDataSignal();
      setBrowserSignal(nextBrowserSignal);
      featureDebugLog("media", "Browser reduced-data signal updated", { browserSignal: nextBrowserSignal });
    };

    networkInformation.addEventListener("change", handleChange);
    return () => {
      networkInformation.removeEventListener("change", handleChange);
    };
  }, []);

  const enabled = resolveReducedDataEnabled(mode, browserSignal);
  useEffect(() => {
    featureDebugLog("media", "Resolved reduced-data mode", { mode, browserSignal, enabled });
  }, [browserSignal, enabled, mode]);

  return enabled;
}
