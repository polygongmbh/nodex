type LogPayload = Record<string, unknown> | undefined;

const IS_DEV = import.meta.env.DEV;

export function nostrDevLog(scope: string, message: string, payload?: LogPayload): void {
  if (!IS_DEV) return;
  if (payload) {
    console.debug(`[nostr:${scope}] ${message}`, payload);
    return;
  }
  console.debug(`[nostr:${scope}] ${message}`);
}
