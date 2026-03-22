import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { NostrAuthModal, NostrUserMenu } from "./NostrAuthModal";
import type { AuthMethod, NostrUser } from "@/infrastructure/nostr/ndk-context";
import { NostrEventKind } from "@/lib/nostr/types";

const loginWithExtension = vi.fn(() => new Promise<boolean>(() => {}));
const ndkMock = {
  loginWithExtension,
  loginWithPrivateKey: vi.fn(async () => true),
  loginAsGuest: vi.fn(async () => true),
  loginWithNostrConnect: vi.fn(async () => true),
  loginWithNoas: vi.fn(async () => ({ success: true })),
  signupWithNoas: vi.fn(async () => ({ success: true })),
  defaultNoasHostUrl: "",
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

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ndkMock,
}));

describe("NostrAuthModal", () => {
  const openChooserIfNeeded = () => {
    const moreOptionsButton = screen.queryByRole("button", { name: /^nostr authentication options$/i });
    if (moreOptionsButton) {
      fireEvent.click(moreOptionsButton);
    }
  };

  const openNoasEntryIfNeeded = () => {
    const noasEntryButton = screen.queryByRole("button", { name: /noas authentication/i });
    if (noasEntryButton) {
      fireEvent.click(noasEntryButton);
    }
  };

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
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_ALLOW_GUEST_SIGN_IN", "true");
    ndkMock.isConnected = true;
    ndkMock.user = null;
    ndkMock.authMethod = null;
    ndkMock.needsProfileSetup = false;
    ndkMock.isProfileSyncing = false;
    ndkMock.updateUserProfile = vi.fn(async () => true);
    ndkMock.loginWithNoas = vi.fn(async () => ({ success: true }));
    ndkMock.signupWithNoas = vi.fn(async () => ({ success: true }));
    ndkMock.defaultNoasHostUrl = "";
  });

  it("starts on the auth chooser and still shows Noas when no Noas env is configured", () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /noas authentication/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^more options$/i })).not.toBeInTheDocument();
  });

  it("renders chooser options in the requested order", () => {
    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    openChooserIfNeeded();

    const noasOption = screen.getByRole("button", { name: /noas authentication/i });
    const signerOption = screen.getByRole("button", { name: /remote signer/i });
    const extensionOption = screen.getByRole("button", { name: /browser extension/i });
    const guestOption = screen.getByRole("button", { name: /guest identity/i });
    const privateKeyOption = screen.getByRole("button", { name: /private key/i });
    const orderedOptions = [noasOption, extensionOption, signerOption, privateKeyOption, guestOption];

    orderedOptions.slice(0, -1).forEach((option, index) => {
      expect(option.compareDocumentPosition(orderedOptions[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    });
  });

  it("hides guest identity sign-in when disabled by env", () => {
    vi.stubEnv("VITE_ALLOW_GUEST_SIGN_IN", "false");

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    openChooserIfNeeded();

    expect(screen.queryByRole("button", { name: /guest identity/i })).not.toBeInTheDocument();
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

    openChooserIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /browser extension/i }));

    const extensionOption = screen.getByRole("button", { name: /browser extension/i });
    const guestOption = screen.getByRole("button", { name: /guest identity/i });

    expect(extensionOption).toHaveAttribute("aria-busy", "true");
    expect(guestOption).toHaveAttribute("aria-busy", "false");
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

  it("adds a profile trigger hint including the logged-in npub", () => {
    ndkMock.user = {
      npub: "npub1hint",
      pubkey: "b".repeat(64),
      profile: { name: "Hint User" },
    };
    ndkMock.authMethod = "extension";

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    const profileTrigger = screen.getByRole("button", { name: /profile: hint user/i });
    expect(profileTrigger).toHaveAttribute("title", expect.stringContaining("npub1"));
  });

  it("ignores outside click when auth form input is dirty", () => {
    const onClose = vi.fn();

    render(<NostrAuthModal isOpen onClose={onClose} />);

    openChooserIfNeeded();
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

    openNoasEntryIfNeeded();
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice_name" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });

    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice_name");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("password123");

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(screen.getByLabelText(/^username$/i)).toHaveValue("alice_name");
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("password123");
  });

  it("shows an immediately editable empty Noas host when no Noas env is configured", () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    openNoasEntryIfNeeded();

    const hostInput = screen.getByLabelText(/^host$/i) as HTMLInputElement;
    expect(hostInput).toHaveValue("");
    expect(hostInput).not.toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /edit noas host/i })).not.toBeInTheDocument();
  });

  it("prefills the Noas host and opens directly to Noas when startup discovery resolved a host", () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.defaultNoasHostUrl = "https://example.com";

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /noas authentication/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^host$/i)).toHaveValue("https://example.com");
  });

  it("shows a connection-specific Noas error when the host request fails", async () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.loginWithNoas = vi.fn(async () => ({ success: false, errorCode: "connection_failed" }));

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    openNoasEntryIfNeeded();
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^host$/i), { target: { value: "https://custom.noas.example/api" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(ndkMock.loginWithNoas).toHaveBeenCalled());
    expect(screen.getAllByText(/connection to the noas host failed/i)).toHaveLength(1);
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("shows the raw Noas sign-in error payload with HTTP status when provided", async () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.loginWithNoas = vi.fn(async () => ({
      success: false,
      errorCode: "server_error",
      errorMessage: "Username already active. Sign in.",
      httpStatus: 409,
    }));

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    openNoasEntryIfNeeded();
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^host$/i), { target: { value: "https://custom.noas.example/api" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(ndkMock.loginWithNoas).toHaveBeenCalled());
    expect(screen.getAllByText("409 Conflict: Username already active. Sign in.")).toHaveLength(1);
  });

  it("shows the raw Noas sign-up error payload with HTTP status when provided", async () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.signupWithNoas = vi.fn(async () => ({
      success: false,
      errorCode: "server_error",
      errorMessage: "Username already active. Sign in.",
      httpStatus: 409,
    }));

    render(<NostrAuthModal isOpen onClose={vi.fn()} />);

    openNoasEntryIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^host$/i), { target: { value: "https://custom.noas.example/api" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/private key/i), {
      target: { value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign up$/i })[1]);

    await waitFor(() => expect(ndkMock.signupWithNoas).toHaveBeenCalled());
    expect(screen.getAllByText("409 Conflict: Username already active. Sign in.")).toHaveLength(1);
  });

  it("toasts the returned Noas message and switches to sign in when signup succeeds without active status", async () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.signupWithNoas = vi.fn(async () => ({
      success: false,
      registrationSucceeded: true,
      status: "pending_email_verification",
      message: "Check your inbox to activate your account.",
    }));
    const onClose = vi.fn();

    render(<NostrAuthModal isOpen onClose={onClose} />);

    openNoasEntryIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^host$/i), { target: { value: "https://custom.noas.example/api" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/private key/i), {
      target: { value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign up$/i })[1]);

    await waitFor(() => expect(ndkMock.signupWithNoas).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Check your inbox to activate your account.");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByText("Check your inbox to activate your account.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^sign in$/i })).toHaveLength(2);
  });

  it("suppresses the generic signup toast when the Noas server returns an active signup message", async () => {
    vi.stubEnv("VITE_NOAS_API_URL", "");
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.signupWithNoas = vi.fn(async () => ({
      success: true,
      registrationSucceeded: true,
      status: "active",
      message: "Account activated.",
    }));
    const onClose = vi.fn();

    render(<NostrAuthModal isOpen onClose={onClose} />);

    openNoasEntryIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^host$/i), { target: { value: "https://custom.noas.example/api" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/private key/i), {
      target: { value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign up$/i })[1]);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Account activated.");
    expect(toast.success).not.toHaveBeenCalledWith("Account created successfully");
  });

  it("opens directly to noas sign up when requested and still allows switching to sign in", () => {
    render(<NostrAuthModal isOpen onClose={vi.fn()} initialStep="noasSignUp" />);

    expect(screen.getAllByRole("button", { name: /^sign up$/i })).toHaveLength(2);
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(screen.getAllByRole("button", { name: /^sign in$/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^nostr authentication options$/i })).toBeInTheDocument();
  });

  it("applies sign-up initialStep when the modal opens after mount", () => {
    const { rerender } = render(<NostrAuthModal isOpen={false} onClose={vi.fn()} />);

    rerender(<NostrAuthModal isOpen onClose={vi.fn()} initialStep="noasSignUp" />);

    expect(screen.getAllByRole("button", { name: /^sign up$/i })).toHaveLength(2);
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
  });

});
