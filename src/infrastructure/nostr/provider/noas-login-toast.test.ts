import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { resolveNoasLoginHandle, showNoasLoginToast } from "./noas-login-toast";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

vi.mock("@/lib/i18n/config", () => ({
  default: {
    t: vi.fn((key: string, params?: { handle?: string }) => {
      if (key === "auth.modal.success.noas") return "Signed in with Noas!";
      if (key === "auth.modal.success.noasDescription") {
        return `Logged in as ${params?.handle} via Noas.`;
      }
      return key;
    }),
  },
}));

describe("resolveNoasLoginHandle", () => {
  it("appends the Noas host domain for plain usernames", () => {
    expect(resolveNoasLoginHandle("alice", "https://noas.example/api/v1")).toBe("alice@noas.example");
  });

  it("keeps full handles unchanged", () => {
    expect(resolveNoasLoginHandle("alice@example.org", "https://noas.example/api/v1")).toBe("alice@example.org");
  });
});

describe("showNoasLoginToast", () => {
  it("shows a detailed Noas login toast with the resolved handle", () => {
    showNoasLoginToast({
      username: "alice",
      apiBaseUrl: "https://noas.example/api/v1",
    });

    expect(toast.success).toHaveBeenCalledWith("Signed in with Noas!", {
      description: "Logged in as alice@noas.example via Noas.",
    });
  });
});
