type WindowWithNostr = Window & { nostr?: unknown };

export const STORAGE_KEY_AUTH = "nostr_auth_method";
export const STORAGE_KEY_NSEC = "nostr_guest_nsec";
export const STORAGE_KEY_NIP46_BUNKER = "nostr_nip46_bunker";
export const STORAGE_KEY_NIP46_LOCAL_NSEC = "nostr_nip46_local_nsec";

export const hasNostrExtension = (): boolean =>
  typeof window !== "undefined" && Boolean((window as WindowWithNostr).nostr);
