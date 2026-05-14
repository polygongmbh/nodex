import { useMemo } from "react";
import { makeIsCore, resolveCoreChannels } from "./core-channels";

const CORE_CHANNELS = resolveCoreChannels();
const IS_CORE = makeIsCore(CORE_CHANNELS);

export function useCoreChannels(): {
  coreChannels: Set<string>;
  isCore: (tag: string) => boolean;
} {
  return useMemo(() => ({ coreChannels: CORE_CHANNELS, isCore: IS_CORE }), []);
}
