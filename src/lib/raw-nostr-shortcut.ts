type RawEventShortcutLike = {
  altKey?: boolean;
  shiftKey?: boolean;
  button?: number;
};

export function isRawNostrEventShortcutClick(event: RawEventShortcutLike): boolean {
  return event.button === 0 && Boolean(event.shiftKey && event.altKey);
}
