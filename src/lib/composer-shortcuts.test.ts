import {
  hasAnyModifierActive,
  isAlternateSubmitKey,
  isAutocompleteAcceptKey,
  isMetadataOnlyAutocompleteClick,
  isMetadataOnlyAutocompleteKey,
  isPrimarySubmitKey,
} from "./composer-shortcuts";

describe("composer shortcut helpers", () => {
  const base = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    getModifierState: () => false,
  };

  it("accepts Tab and plain Enter for autocomplete insertion", () => {
    expect(isAutocompleteAcceptKey({ ...base, key: "Tab" })).toBe(true);
    expect(isAutocompleteAcceptKey({ ...base, key: "Enter" })).toBe(true);
    expect(isAutocompleteAcceptKey({ ...base, key: "Enter", altKey: true })).toBe(false);
  });

  it("treats only Alt as metadata-only autocomplete shortcut", () => {
    expect(isMetadataOnlyAutocompleteKey({ ...base, key: "Enter", altKey: true })).toBe(true);
    expect(isMetadataOnlyAutocompleteKey({ ...base, key: "Enter", ctrlKey: true })).toBe(false);
    expect(isMetadataOnlyAutocompleteKey({ ...base, key: "Enter", metaKey: true })).toBe(false);
  });

  it("detects submit shortcuts", () => {
    expect(isPrimarySubmitKey({ ...base, key: "Enter", ctrlKey: true })).toBe(true);
    expect(isPrimarySubmitKey({ ...base, key: "Enter", metaKey: true })).toBe(true);
    expect(isPrimarySubmitKey({ ...base, key: "Enter", altKey: true })).toBe(false);
    expect(isAlternateSubmitKey({ ...base, key: "Enter", altKey: true })).toBe(true);
  });

  it("supports getModifierState fallback and alt-only click behavior", () => {
    const withAltState = {
      ...base,
      getModifierState: (key: string) => key === "Alt",
    };
    expect(isMetadataOnlyAutocompleteClick(withAltState)).toBe(true);
    expect(hasAnyModifierActive(withAltState)).toBe(true);
    expect(hasAnyModifierActive({ ...base, key: "Enter" })).toBe(false);
  });
});
