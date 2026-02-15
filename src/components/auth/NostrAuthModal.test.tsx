import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NostrAuthModal } from "./NostrAuthModal";

const loginWithExtension = vi.fn(() => new Promise<boolean>(() => {}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({
    loginWithExtension,
    loginWithPrivateKey: vi.fn(async () => true),
    loginAsGuest: vi.fn(async () => true),
    loginWithNostrConnect: vi.fn(async () => true),
    isAuthenticating: false,
    user: null,
    authMethod: null,
    logout: vi.fn(),
    getGuestPrivateKey: vi.fn(() => null),
  }),
}));

describe("NostrAuthModal", () => {
  it("shows loading indicator only on extension option when extension login starts", async () => {
    (window as any).nostr = {};
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /browser extension/i }));

    const extensionOption = screen.getByRole("button", { name: /browser extension/i });
    const guestOption = screen.getByRole("button", { name: /guest identity/i });

    expect(within(extensionOption).getByTestId("auth-loader-extension")).toBeInTheDocument();
    expect(within(guestOption).queryByTestId("auth-loader-guest")).not.toBeInTheDocument();
  });
});
