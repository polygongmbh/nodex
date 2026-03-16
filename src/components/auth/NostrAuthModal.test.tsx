import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  loginWithNoas: vi.fn(async () => true),
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
  const clickOutsideDialog = () => {
    const overlay = document.querySelector("[data-state='open'].fixed.inset-0");
    if (!overlay) {
      throw new Error("Expected dialog overlay to exist");
    }
    fireEvent.pointerDown(overlay);
    fireEvent.mouseDown(overlay);
    fireEvent.mouseUp(overlay);
    fireEvent.click(overlay);
  };

  beforeEach(() => {
    window.localStorage.clear();
    ndkMock.isConnected = true;
    ndkMock.user = null;
    ndkMock.authMethod = null;
    ndkMock.needsProfileSetup = false;
    ndkMock.isProfileSyncing = false;
    ndkMock.updateUserProfile = vi.fn(async () => true);
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

    const backButtons = screen.queryAllByRole("button", { name: /back|auth\.back/i });
    if (backButtons.length > 0) {
      fireEvent.click(backButtons[0]);
    }

    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
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

  it("only auto-opens mandatory profile setup once per required setup cycle", () => {
    ndkMock.user = {
      npub: "npub1test",
      pubkey: "a".repeat(64),
      profile: { name: "" },
    };
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.isProfileSyncing = false;

    const { rerender } = render(<NostrUserMenu onSignInClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dismiss button available after a mandatory profile setup save fails", async () => {
    ndkMock.user = {
      npub: "npub1test",
      pubkey: "a".repeat(64),
      profile: { name: "" },
    };
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.isProfileSyncing = false;
    ndkMock.updateUserProfile = vi.fn(async () => false);

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    fireEvent.change(document.getElementById("profile-name") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(ndkMock.updateUserProfile).toHaveBeenCalled());
    clickOutsideDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("adds a profile trigger hint including the logged-in pubkey", () => {
    ndkMock.user = {
      npub: "npub1hint",
      pubkey: "b".repeat(64),
      profile: { name: "Hint User" },
    };
    ndkMock.authMethod = "extension";

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    const profileTrigger = screen.getByRole("button", { name: /profile: hint user/i });
    expect(profileTrigger).toHaveAttribute("title", expect.stringContaining("b".repeat(64)));
  });

  it("ignores outside click when auth form input is dirty", () => {
    const onClose = vi.fn();

    render(<NostrAuthModal isOpen onClose={onClose} />);

    const backButtons = screen.queryAllByRole("button", { name: /back|auth\.back/i });
    if (backButtons.length > 0) {
      fireEvent.click(backButtons[0]);
    }

    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    fireEvent.click(screen.getByRole("button", { name: /private key/i }));
    fireEvent.change(screen.getByLabelText(/^private key$/i), {
      target: { value: "nsec1example" },
    });

    clickOutsideDialog();

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("preserves shared noas credentials when switching between sign in and sign up", () => {
    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice_name" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });

    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice_name");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("password123");

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice_name");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("password123");
  });

  it("opens directly to noas sign up when requested and still allows switching to sign in", () => {
    render(<NostrAuthModal isOpen onClose={vi.fn()} initialStep="noasSignUp" />);

    expect(screen.getAllByRole("button", { name: /^sign up$/i })).toHaveLength(2);
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(screen.getAllByRole("button", { name: /^sign in$/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^more options$/i })).toBeInTheDocument();
  });

});
