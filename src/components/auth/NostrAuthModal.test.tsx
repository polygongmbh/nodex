import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MemoryRouter, useLocation } from "react-router-dom";
import { NostrAuthModal, NostrUserMenu } from "./NostrAuthModal";
import type { AuthMethod, NDKUser } from "@/infrastructure/nostr/ndk-context";
import { resolveAuthRouteStep } from "@/lib/auth-routes";

const createMockNdkUser = (overrides: Partial<NDKUser> = {}): NDKUser =>
  ({
    npub: "npub1test",
    pubkey: "a".repeat(64),
    profile: {},
    ...overrides,
  } as NDKUser);

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
  hasWritableRelayConnection: true,
  user: null as NDKUser | null,
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

function RoutedModal(props: ComponentProps<typeof NostrAuthModal>) {
  const location = useLocation();
  const routeStep = resolveAuthRouteStep(location.pathname);
  return <NostrAuthModal {...props} initialStep={routeStep ?? props.initialStep} />;
}

function renderModal(props: ComponentProps<typeof NostrAuthModal>, initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <RoutedModal {...props} />
    </MemoryRouter>
  );
}

describe("NostrAuthModal", () => {
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
    ndkMock.hasWritableRelayConnection = true;
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
    vi.stubEnv("VITE_NOAS_HOST_URL", "");

    renderModal({ isOpen: true, onClose: vi.fn() });

    expect(screen.getByRole("button", { name: /noas authentication/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^more options$/i })).not.toBeInTheDocument();
  });

  it("hides guest identity sign-in when disabled by env", () => {
    vi.stubEnv("VITE_ALLOW_GUEST_SIGN_IN", "false");

    renderModal({ isOpen: true, onClose: vi.fn() });

    const noasEntryButton = screen.queryByRole("button", { name: /noas authentication/i });
    if (noasEntryButton) fireEvent.click(noasEntryButton);

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

    renderModal({ isOpen: true, onClose: vi.fn(), initialStep: "choose" });

    fireEvent.click(screen.getByRole("button", { name: /browser extension/i }));

    expect(screen.getByRole("button", { name: /browser extension/i })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: /guest identity/i })).toHaveAttribute("aria-busy", "false");
  });

  it("ignores outside click when auth form input is dirty", () => {
    const onClose = vi.fn();

    renderModal({ isOpen: true, onClose, initialStep: "choose" });

    fireEvent.click(screen.getByRole("button", { name: /private key/i }));
    fireEvent.change(screen.getByLabelText(/^private key$/i), {
      target: { value: "nsec1example" },
    });

    clickOutsideDialog();

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("marks private-key sign-in input as non-credential content", () => {
    renderModal({ isOpen: true, onClose: vi.fn(), initialStep: "choose" });

    fireEvent.click(screen.getByRole("button", { name: /private key/i }));

    const privateKeyInput = screen.getByLabelText(/^private key$/i);
    expect(privateKeyInput).toHaveAttribute("type", "text");
    expect(privateKeyInput).toHaveAttribute("name", "nostrPrivateKey");
    expect(privateKeyInput).toHaveAttribute("autocomplete", "off");
    expect(privateKeyInput).toHaveAttribute("autocapitalize", "none");
    expect(privateKeyInput).toHaveAttribute("autocorrect", "off");
    expect(privateKeyInput).toHaveAttribute("spellcheck", "false");
  });

  it("preserves shared noas credentials when switching between sign in and sign up", () => {
    renderModal({ isOpen: true, onClose: vi.fn() });

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

  it("requires a full handle when no Noas env is configured", () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");

    renderModal({ isOpen: true, onClose: vi.fn() });

    openNoasEntryIfNeeded();
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    expect(screen.getByText(/enter your full nip-05 handle/i)).toBeInTheDocument();
  });

  it("prefills the Noas host as a bare domain and opens directly to Noas when startup discovery resolved a host", () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.defaultNoasHostUrl = "https://example.com";

    renderModal({ isOpen: true, onClose: vi.fn() });

    expect(screen.queryByRole("button", { name: /noas authentication/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("noas-username-suffix")).toHaveTextContent("@example.com");
  });

  it("prefills the Noas host immediately when discovery resolves after the modal mounts", () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");

    const { rerender } = renderModal({ isOpen: true, onClose: vi.fn() });

    openNoasEntryIfNeeded();
    expect(screen.queryByTestId("noas-username-suffix")).not.toBeInTheDocument();

    ndkMock.defaultNoasHostUrl = "https://example.com";
    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <RoutedModal isOpen onClose={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /noas authentication/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("noas-username-suffix")).toHaveTextContent("@example.com");
  });

  it("carries a newly detected Noas host into sign-up without waiting for a restart", () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");

    const { rerender } = renderModal({ isOpen: true, onClose: vi.fn() });

    openNoasEntryIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    expect(screen.queryByTestId("noas-username-suffix")).not.toBeInTheDocument();

    ndkMock.defaultNoasHostUrl = "https://example.com";
    rerender(
      <MemoryRouter initialEntries={["/signup"]}>
        <RoutedModal isOpen onClose={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByTestId("noas-username-suffix")).toHaveTextContent("@example.com");
  });

  it("submits a configured noas https host with internal protocol normalization", async () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.defaultNoasHostUrl = "https://example.com";

    renderModal({ isOpen: true, onClose: vi.fn() });

    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(ndkMock.loginWithNoas).toHaveBeenCalled());
    expect(ndkMock.loginWithNoas).toHaveBeenCalledWith("alice", "password123", {
      baseUrl: "https://example.com",
    });
  });

  it("shows a connection-specific Noas error when the host request fails", async () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.loginWithNoas = vi.fn(async () => ({ success: false, errorCode: "connection_failed" }));

    renderModal({ isOpen: true, onClose: vi.fn() });

    openNoasEntryIfNeeded();
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@custom.noas.example" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(ndkMock.loginWithNoas).toHaveBeenCalled());
    expect(screen.getAllByText(/connection to the noas host failed/i)).toHaveLength(1);
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("shows a key-mismatch-specific Noas error when decrypted and returned pubkeys differ", async () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.loginWithNoas = vi.fn(async () => ({ success: false, errorCode: "key_mismatch" }));

    renderModal({ isOpen: true, onClose: vi.fn() });

    openNoasEntryIfNeeded();
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@custom.noas.example" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(ndkMock.loginWithNoas).toHaveBeenCalled());
    expect(screen.getAllByText(/returned key does not match your account/i)).toHaveLength(1);
    expect(screen.queryByText(/server or key error/i)).not.toBeInTheDocument();
  });

  it("shows the raw Noas sign-in error payload with HTTP status when provided", async () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.loginWithNoas = vi.fn(async () => ({
      success: false,
      errorCode: "server_error",
      errorMessage: "Username already active. Sign in.",
      httpStatus: 409,
    }));

    renderModal({ isOpen: true, onClose: vi.fn() });

    openNoasEntryIfNeeded();
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@custom.noas.example" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign in$/i })[1]);

    await waitFor(() => expect(ndkMock.loginWithNoas).toHaveBeenCalled());
    expect(screen.getAllByText("409 Conflict: Username already active. Sign in.")).toHaveLength(1);
  });

  it("shows the raw Noas sign-up error payload with HTTP status when provided", async () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.signupWithNoas = vi.fn(async () => ({
      success: false,
      errorCode: "server_error",
      errorMessage: "Username already active. Sign in.",
      httpStatus: 409,
    }));

    renderModal({ isOpen: true, onClose: vi.fn() });

    openNoasEntryIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@custom.noas.example" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^private key$/i }), {
      target: { value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign up$/i })[1]);

    await waitFor(() => expect(ndkMock.signupWithNoas).toHaveBeenCalled());
    expect(screen.getAllByText("409 Conflict: Username already active. Sign in.")).toHaveLength(1);
  });

  it("toasts the returned Noas message and switches to sign in when signup succeeds without active status", async () => {
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.signupWithNoas = vi.fn(async () => ({
      success: false,
      registrationSucceeded: true,
      status: "pending_email_verification",
      message: "Check your inbox to activate your account.",
    }));
    const onClose = vi.fn();

    renderModal({ isOpen: true, onClose });

    openNoasEntryIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@custom.noas.example" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^private key$/i }), {
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
    vi.stubEnv("VITE_NOAS_HOST_URL", "");
    ndkMock.signupWithNoas = vi.fn(async () => ({
      success: true,
      registrationSucceeded: true,
      status: "active",
      message: "Account activated.",
    }));
    const onClose = vi.fn();

    renderModal({ isOpen: true, onClose });

    openNoasEntryIfNeeded();
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));
    fireEvent.change(screen.getByLabelText(/^username$/i), { target: { value: "alice@custom.noas.example" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^private key$/i }), {
      target: { value: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /^sign up$/i })[1]);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Account activated.");
    expect(toast.success).not.toHaveBeenCalledWith("Account created successfully");
  });

  it("applies sign-up initialStep when the modal opens after mount", () => {
    const { rerender } = renderModal({ isOpen: false, onClose: vi.fn() });

    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <RoutedModal isOpen onClose={vi.fn()} initialStep="noasSignUp" />
      </MemoryRouter>
    );

    expect(screen.getAllByRole("button", { name: /^sign up$/i })).toHaveLength(2);
    expect(screen.getByLabelText(/^username$/i)).toBeInTheDocument();
  });
});

describe("NostrUserMenu", () => {
  const clickOutsideDialog = () => {
    const overlay = document.querySelector("[data-state='open'].fixed.inset-0");
    if (!overlay) throw new Error("Expected dialog overlay to exist");
    fireEvent.pointerDown(overlay);
    fireEvent.mouseDown(overlay);
    fireEvent.mouseUp(overlay);
    fireEvent.click(overlay);
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    ndkMock.isConnected = true;
    ndkMock.hasWritableRelayConnection = true;
    ndkMock.user = null;
    ndkMock.authMethod = null;
    ndkMock.needsProfileSetup = false;
    ndkMock.isProfileSyncing = false;
    ndkMock.updateUserProfile = vi.fn(async () => true);
  });

  it("renders safely when user signs out after profile setup was required", () => {
    ndkMock.user = createMockNdkUser({ profile: { name: "Alice" } });
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;

    const { rerender } = render(<NostrUserMenu onSignInClick={vi.fn()} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();

    ndkMock.user = null;
    ndkMock.needsProfileSetup = false;
    rerender(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.getByRole("button", { name: /sign in to post/i })).toBeInTheDocument();
  });

  it("does not auto-open setup profile dialog while profile sync is in progress", () => {
    ndkMock.user = createMockNdkUser({ profile: { name: "" } });
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
    ndkMock.user = createMockNdkUser({ profile: { name: "" } });
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.isConnected = false;

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not auto-open setup profile dialog when only read-only relays are available", () => {
    ndkMock.user = createMockNdkUser({ pubkey: "b".repeat(64), profile: { name: "" } });
    ndkMock.authMethod = "guest";
    ndkMock.needsProfileSetup = true;
    ndkMock.hasWritableRelayConnection = false;

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("only auto-opens mandatory profile setup once per required setup cycle", () => {
    ndkMock.user = createMockNdkUser({ profile: { name: "" } });
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;

    const { rerender } = render(<NostrUserMenu onSignInClick={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<NostrUserMenu onSignInClick={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dismiss button available after a mandatory profile setup save fails", async () => {
    ndkMock.user = createMockNdkUser({ profile: { name: "" } });
    ndkMock.authMethod = "extension";
    ndkMock.needsProfileSetup = true;
    ndkMock.updateUserProfile = vi.fn(async () => false);

    render(<NostrUserMenu onSignInClick={vi.fn()} />);

    fireEvent.change(document.getElementById("profile-name") as HTMLInputElement, { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(ndkMock.updateUserProfile).toHaveBeenCalled());
    clickOutsideDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
