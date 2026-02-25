type FeatureDebugPayload = Record<string, unknown> | undefined;

const DEBUG_FEATURES_ENV = String(import.meta.env.VITE_DEBUG_FEATURES || "").toLowerCase() === "true";

function shouldDebugFeatures(): boolean {
  if (DEBUG_FEATURES_ENV) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("nodex.debug.features") === "true";
  } catch {
    return false;
  }
}

export function featureDebugLog(scope: string, message: string, payload?: FeatureDebugPayload): void {
  if (!shouldDebugFeatures()) return;
  if (payload) {
    console.debug(`[feature:${scope}] ${message}`, payload);
    return;
  }
  console.debug(`[feature:${scope}] ${message}`);
}
