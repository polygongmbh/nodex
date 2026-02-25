type FeatureDebugPayload = Record<string, unknown> | undefined;

const IS_DEV = import.meta.env.DEV;
const DEBUG_FEATURES_ENV = String(import.meta.env.VITE_DEBUG_FEATURES || "").toLowerCase() === "true";

function shouldDebugFeatures(): boolean {
  return IS_DEV || DEBUG_FEATURES_ENV;
}

export function featureDebugLog(scope: string, message: string, payload?: FeatureDebugPayload): void {
  if (!shouldDebugFeatures()) return;
  if (payload) {
    console.debug(`[feature:${scope}] ${message}`, payload);
    return;
  }
  console.debug(`[feature:${scope}] ${message}`);
}
