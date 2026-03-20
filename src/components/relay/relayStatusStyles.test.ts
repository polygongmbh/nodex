import { describe, expect, it } from "vitest";
import { getRelayStatusDotClass, getRelayStatusTextClass } from "./relayStatusStyles";

describe("relayStatusStyles", () => {
  it("keeps connection-error styling neutral", () => {
    expect(getRelayStatusDotClass("connection-error")).toBe("bg-slate-400");
    expect(getRelayStatusTextClass("connection-error")).toBe("text-slate-400");
  });

  it("keeps verification-failed styling distinct from transport errors", () => {
    expect(getRelayStatusDotClass("verification-failed")).toBe("bg-destructive");
    expect(getRelayStatusTextClass("verification-failed")).toBe("text-destructive");
  });
});
