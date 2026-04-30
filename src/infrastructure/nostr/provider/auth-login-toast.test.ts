import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { resolveNoasLoginHandle, showLoginSuccessToast } from "./auth-login-toast";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

vi.mock("@/lib/i18n/config", () => ({
  default: {
    t: vi.fn((key: string, params?: { handle?: string }) => {
      if (key === "auth.modal.success.extension") return "Signed in with Nostr extension!";
      if (key === "auth.modal.success.privateKey") return "Signed in with private key!";
      if (key === "auth.modal.success.guest") return "Signed in as guest! A new identity was created for you.";
      if (key === "auth.modal.success.signer") return "Connected to signer app!";
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

describe("showLoginSuccessToast", () => {
  it.each([
    ["extension", "Signed in with Nostr extension!"],
    ["privateKey", "Signed in with private key!"],
    ["guest", "Signed in as guest! A new identity was created for you."],
    ["nostrConnect", "Connected to signer app!"],
  ] as const)("shows the localized success toast for %s", (authMethod, message) => {
    showLoginSuccessToast({ authMethod });
    expect(toast.success).toHaveBeenCalledWith(message);
  });

  it("shows a detailed Noas login toast with the resolved handle", () => {
    showLoginSuccessToast({
      authMethod: "noas",
      noasUsername: "alice",
      noasApiBaseUrl: "https://noas.example/api/v1",
    });

    expect(toast.success).toHaveBeenCalledWith("Signed in with Noas!", {
      description: "Logged in as alice@noas.example via Noas.",
    });
  });
});
