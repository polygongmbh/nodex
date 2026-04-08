import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSafeLocalStorageWarningsForTests,
  safeLocalStorageSetItem,
} from "./safe-local-storage";

describe("safeLocalStorageSetItem", () => {
  beforeEach(() => {
    resetSafeLocalStorageWarningsForTests();
  });

  it("returns true when write succeeds", () => {
    expect(safeLocalStorageSetItem("key", "value")).toBe(true);
  });

  it("returns false and warns once per key+error when write fails", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(safeLocalStorageSetItem("key", "value", { context: "test" })).toBe(false);
    expect(safeLocalStorageSetItem("key", "value", { context: "test" })).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("warns separately for different error types", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    setItemSpy
      .mockImplementationOnce(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      })
      .mockImplementationOnce(() => {
        throw new DOMException("security blocked", "SecurityError");
      });

    expect(safeLocalStorageSetItem("key", "value")).toBe(false);
    expect(safeLocalStorageSetItem("key", "value")).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
