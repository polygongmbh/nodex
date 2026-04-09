import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSafeLocalStorageWarningsForTests,
  safeLocalStorageSetItem,
} from "./safe-local-storage";

describe("safeLocalStorageSetItem", () => {
  const createFailingStorage = (...errors: Error[]): Storage => {
    let index = 0;
    return {
      get length() {
        return 0;
      },
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(() => {
        throw errors[Math.min(index++, errors.length - 1)];
      }),
    };
  };

  beforeEach(() => {
    resetSafeLocalStorageWarningsForTests();
  });

  it("returns true when write succeeds", () => {
    expect(safeLocalStorageSetItem("key", "value")).toBe(true);
  });

  it("returns false and warns once per key+error when write fails", () => {
    const storage = createFailingStorage(new DOMException("quota exceeded", "QuotaExceededError"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(safeLocalStorageSetItem("key", "value", { context: "test", storage })).toBe(false);
    expect(safeLocalStorageSetItem("key", "value", { context: "test", storage })).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  it("warns separately for different error types", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const storage = createFailingStorage(
      new DOMException("quota exceeded", "QuotaExceededError"),
      new DOMException("security blocked", "SecurityError")
    );

    expect(safeLocalStorageSetItem("key", "value", { storage })).toBe(false);
    expect(safeLocalStorageSetItem("key", "value", { storage })).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });
});
