import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { MobileFilters } from "./MobileFilters";
import { FeedSurfaceProvider } from "@/features/feed-page/views/feed-surface-context";
import type { Channel, Relay } from "@/types";
import type { Person } from "@/types/person";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";
import { makeQuickFilterState } from "@/test/quick-filter-state";

// --- module mocks -----------------------------------------------------------

const ndkMock = {
  user: {
    pubkey: "abc123",
    npub: "npub1abc",
    profile: { displayName: "Guest User" },
  },
  authMethod: "guest" as const,
  logout: vi.fn(),
  getGuestPrivateKey: () => "f".repeat(64),
  needsProfileSetup: false,
  updateUserProfile: vi.fn(async () => true),
  publishEvent: vi.fn(async () => ({ success: true })),
};

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ndkMock,
}));

vi.mock("@/hooks/use-profile-editor", () => ({
  useProfileEditor: () => ({
    fields: {
      username: "",
      displayName: "",
      picture: "",
      nip05: "",
      about: "",
      presencePublishingEnabled: true,
      publishDelayEnabled: true,
      autoCaptionEnabled: true,
    },
    isSavingProfile: false,
    validation: { usernameHint: null, isUsernameHintError: false, isUsernameValid: true },
    fieldActions: {
      setUsername: () => {},
      setDisplayName: () => {},
      setPicture: () => {},
      setNip05: () => {},
      setAbout: () => {},
    },
    resetFromProfile: () => {},
    handleSaveProfile: vi.fn(async () => true),
    handlePresencePublishingChange: () => {},
    handlePublishDelayChange: () => {},
    handleAutoCaptionChange: () => {},
  }),
}));

const dispatchFeedInteraction = vi.fn(async (intent: FeedInteractionIntent) => ({
  envelope: { id: 1, dispatchedAtMs: Date.now(), intent },
  outcome: { status: "handled" as const },
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

// --- shared fixtures --------------------------------------------------------

const relays: Relay[] = [
  { id: "demo", name: "Demo", isActive: true, url: "wss://demo.test" },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
];

const people: Person[] = [
  { id: "p1", name: "Alice", displayName: "Alice", avatar: "", isOnline: true, isSelected: false },
];

function renderMobileFilters(overrides: Partial<React.ComponentProps<typeof MobileFilters>> = {}) {
  return render(
    <MobileFilters relays={relays} channels={channels} people={people} {...overrides} />
  );
}

// ----------------------------------------------------------------------------

describe("MobileFilters management view", () => {
  beforeEach(() => {
    window.localStorage.clear();
    dispatchFeedInteraction.mockClear();
    ndkMock.user = {
      pubkey: "abc123",
      npub: "npub1abc",
      profile: { displayName: "Guest User" },
    };
  });

  it("prefers shared visible channel and people lists over broader surface datasets", () => {
    render(
      <FeedSurfaceProvider
        value={{
          relays,
          channels: [{ id: "broad-channel", name: "broad-channel", filterState: "neutral" }],
          visibleChannels: [{ id: "visible-channel", name: "visible-channel", filterState: "neutral" }],
          composeChannels: channels,
          people: [
            { id: "broad-person", name: "Broad Person", displayName: "Broad Person", avatar: "", isOnline: false, isSelected: false },
          ],
          visiblePeople: [
            { id: "visible-person", name: "visible-user", displayName: "Visible Person", avatar: "", isOnline: true, isSelected: false },
          ],
          searchQuery: "",
          quickFilters: makeQuickFilterState(),
          channelMatchMode: "and",
        }}
      >
        <MobileFilters />
      </FeedSurfaceProvider>
    );

    expect(screen.getByRole("button", { name: /#visible-channel/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /#broad-channel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /visible person/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /visible-user/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /broad person/i })).not.toBeInTheDocument();
  });

  it("renders app preferences outside the profile editor card", () => {
    renderMobileFilters();

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByLabelText(/share current status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/delay send so you can undo/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/generate image captions on this device/i)).not.toBeInTheDocument();
    expect(document.getElementById("manage-profile-presence-enabled")).toBeNull();
    expect(document.getElementById("manage-profile-publish-delay-enabled")).toBeNull();
    expect(document.getElementById("manage-profile-auto-caption-enabled")).toBeNull();
  });

  it("renders guest private key row when signed in as guest", () => {
    renderMobileFilters();

    // MobileFilters is responsible for conditionally mounting GuestPrivateKeyRow;
    // the row's own interactions are tested in GuestPrivateKeyRow.test.tsx.
    expect(screen.getByText(/backup private key/i)).toBeInTheDocument();
  });

  it("uses a single generic success toast when copying a guest private key", () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderMobileFilters();
    fireEvent.click(screen.getByRole("button", { name: /copy private key/i }));

    expect(writeText).toHaveBeenCalledWith("f".repeat(64));
    expect(toast.success).toHaveBeenCalledWith("Private key copied to clipboard");
  });
});
