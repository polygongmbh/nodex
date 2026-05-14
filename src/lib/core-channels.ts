const CORE_CHANNELS_ENV_KEY = "VITE_CORE_CHANNELS";

export function resolveCoreChannels(
  env: Record<string, unknown> = import.meta.env
): Set<string> {
  const raw = env[CORE_CHANNELS_ENV_KEY];
  if (typeof raw !== "string") return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function makeIsCore(coreChannels: Set<string>): (tag: string) => boolean {
  return (tag: string) => coreChannels.has(tag.toLowerCase());
}
