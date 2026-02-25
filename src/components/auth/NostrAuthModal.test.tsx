import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NostrAuthModal, NostrUserMenu } from "./NostrAuthModal";
import type { AuthMethod, NostrUser } from "@/lib/nostr/ndk-context";
import { NostrEventKind } from "@/lib/nostr/types";

const loginWithExtension = vi.fn(() => new Promise<boolean>(() => {}));
const ndkMock = {
  loginWithExtension,
  loginWithPrivateKey: vi.fn(async () => true),
  loginAsGuest: vi.fn(async () => true),
  loginWithNostrConnect: vi.fn(async () => true),
  isAuthenticating: false,
  isConnected: true,
  user: null as NostrUser | null,
  authMethod: null as AuthMethod,
  logout: vi.fn(),
  getGuestPrivateKey: vi.fn(() => null),
  needsProfileSetup: false,
  isProfileSyncing: false,
  updateUserProfile: vi.fn(async () => true),
};

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ndkMock,
}));

describe("NostrAuthModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
    ndkMock.isConnected = true;
    ndkMock.user = null;
    ndkMock.authMethod = null;
    ndkMock.needsProfileSetup = false;
    ndkMock.isProfileSyncing = false;
  });

  it("shows loading indicator only on extension option when extension login starts", async () => {
    Object.assign(window as Window & { nostr?: unknown }, { nostr: {} });
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

  it("renders safely when user signs out after profile setup was required", () => {
    ndkMock.user = {
      npub: "npub1test",
      pubkey: "a".repeat(64),
      profile: { name: "Alice" },
    };
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.isProfileSyncing = false;

    const { rerender } = render(<NostrUserMenu onSignInClick={vi.fn()} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();

    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;
    ndkMock.isProfileSyncing = false;
    rerender(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: /sign in to post/i })).toBeInTheDocument();
  });

  it("does not auto-open setup profile dialog while profile sync is in progress", () => {
    ndkMock.user = {
      npub: "npub1test",
      pubkey: "a".repeat(64),
      profile: { name: "" },
    };
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.isProfileSyncing = true;

    const { rerender } = render(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    ndkMock.isProfileSyncing = false;
    rerender(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not auto-open setup profile dialog when no relay is connected", () => {
    ndkMock.user = {
      npub: "npub1test",
      pubkey: "a".repeat(64),
      profile: { name: "" },
    };
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.isProfileSyncing = false;
    ndkMock.isConnected = false;

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    ndkMock.isConnected = true;
  });

  it("uses cached kind:0 metadata for current user display when profile is missing", () => {
    const pubkey = "f".repeat(64);
    window.localStorage.setItem(
      "nodex.kind0.cache.v1",
      JSON.stringify([
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 123,
          content: JSON.stringify({ name: "Cached Alice" }),
        },
      ])
    );
    ndkMock.user = {
      npub: "npub1cached",
      pubkey,
      profile: {},
    };
    ndkMock.authMethod = "extension";

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.getByText("Cached Alice")).toBeInTheDocument();
  });

  it("keeps auto-opened profile setup dialog focused on identity fields", () => {
    ndkMock.user = {
      npub: "npub1test",
      pubkey: "a".repeat(64),
      profile: { name: "" },
    };
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.isProfileSyncing = false;

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.getElementById("profile-name")).toBeInTheDocument();
    expect(document.getElementById("profile-presence-enabled")).toBeNull();
    expect(document.getElementById("profile-publish-delay-enabled")).toBeNull();
    expect(document.getElementById("profile-auto-caption-enabled")).toBeNull();
  });

});
