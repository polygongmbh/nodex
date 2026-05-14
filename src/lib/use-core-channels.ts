import { useMemo } from "react";
import { makeIsCore, resolveCoreChannels } from "./core-channels";

export function useCoreChannels(): {
  coreChannels: Set<string>;
  isCore: (tag: string) => boolean;
} {
  return useMemo(() => {
    const coreChannels = resolveCoreChannels();
    return { coreChannels, isCore: makeIsCore(coreChannels) };
  }, []);
}
