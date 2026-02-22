type ModifierStateLike = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  getModifierState?: (keyArg: string) => boolean;
};

type KeyEventLike = ModifierStateLike & {
  key: string;
};

function hasModifierState(event: ModifierStateLike, key: string): boolean {
  return Boolean(event.getModifierState?.(key));
}

export function isAltModifierActive(event: ModifierStateLike): boolean {
  return event.altKey || hasModifierState(event, "Alt");
}

export function hasAnyModifierActive(event: ModifierStateLike): boolean {
  return (
    isAltModifierActive(event) ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    hasModifierState(event, "Control") ||
    hasModifierState(event, "Meta") ||
    hasModifierState(event, "Shift")
  );
}

export function isAutocompleteAcceptKey(event: KeyEventLike): boolean {
  return event.key === "Tab" || (event.key === "Enter" && !hasAnyModifierActive(event));
}

export function isMetadataOnlyAutocompleteKey(event: KeyEventLike): boolean {
  return event.key === "Enter" && isAltModifierActive(event);
}

export function isPrimarySubmitKey(event: KeyEventLike): boolean {
  return (
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey || hasModifierState(event, "Control") || hasModifierState(event, "Meta"))
  );
}

export function isAlternateSubmitKey(event: KeyEventLike): boolean {
  return event.key === "Enter" && isAltModifierActive(event);
}

export function isMetadataOnlyAutocompleteClick(event: ModifierStateLike): boolean {
  return isAltModifierActive(event);
}
