export type AvatarGenerator = "boring" | "dicebear-local";

const AVATAR_GENERATOR_STORAGE_KEY = "nodex.avatar.generator";
const DEFAULT_AVATAR_GENERATOR: AvatarGenerator = "boring";
const AVATAR_CHANGE_EVENT = "nodex:avatar-generator-change";

function normalize(value: string | null): AvatarGenerator {
  if (value === "dicebear-local") return "dicebear-local";
  return DEFAULT_AVATAR_GENERATOR;
}

export function getPreferredAvatarGenerator(): AvatarGenerator {
  if (typeof window === "undefined") return DEFAULT_AVATAR_GENERATOR;
  return normalize(window.localStorage.getItem(AVATAR_GENERATOR_STORAGE_KEY));
}

export function setPreferredAvatarGenerator(generator: AvatarGenerator): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AVATAR_GENERATOR_STORAGE_KEY, generator);
  window.dispatchEvent(new CustomEvent(AVATAR_CHANGE_EVENT, { detail: generator }));
}

export function subscribeAvatarGeneratorChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === AVATAR_GENERATOR_STORAGE_KEY) {
      callback();
    }
  };
  const onCustom = () => callback();

  window.addEventListener("storage", onStorage);
  window.addEventListener(AVATAR_CHANGE_EVENT, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AVATAR_CHANGE_EVENT, onCustom);
  };
}
