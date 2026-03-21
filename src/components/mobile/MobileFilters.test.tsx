import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileFilters } from "./MobileFilters";
import type { Channel, Person, Relay } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";

const ndkMock = {
  user: {
    pubkey: "abc123",
    npub: "npub1abc",
    profile: { displayName: "Guest User" },
  },
  authMethod: "guest",
  logout: vi.fn(),
  getGuestPrivateKey: () => "f".repeat(64),
  needsProfileSetup: false,
  updateUserProfile: vi.fn(async () => true),
  publishEvent: vi.fn(async () => ({ success: true })),
};

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ndkMock,
}));

vi.mock("@/components/layout/VersionHint", () => ({
  VersionHint: ({ showChangelogLabel = false }: { showChangelogLabel?: boolean }) => (
    <button type="button">{showChangelogLabel ? "v2.0.0 Changelog" : "v2.0.0"}</button>
  ),
}));

vi.mock("@/components/legal/LegalDialog", () => ({
  LegalDialog: ({ triggerLabel = "Legal" }: { triggerLabel?: string }) => (
    <button type="button" aria-label="Open imprint and privacy policy">
      {triggerLabel}
    </button>
  ),
  resolveLegalContactEmail: () => "mail@nodex.nexus",
}));

vi.mock("@/components/theme/CompletionFeedbackToggle", () => ({
  CompletionFeedbackToggle: () => <button type="button">Completion feedback</button>,
}));

vi.mock("@/components/theme/LanguageToggle", () => ({
  LanguageToggle: () => <button type="button" aria-label="Language: English">EN</button>,
}));

vi.mock("@/components/filters/ChannelMatchModeToggle", () => ({
  ChannelMatchModeToggle: ({
    mode,
    onChange,
  }: {
    mode: "and" | "or";
    onChange?: (mode: "and" | "or") => void;
  }) => (
    <button
      type="button"
      aria-label="Included channel match mode"
      onClick={() => onChange?.(mode === "and" ? "or" : "and")}
    >
      Match mode
    </button>
  ),
}));

vi.mock("@/hooks/use-profile-editor", () => ({
  useProfileEditor: () => ({
    fields: {
      profileName: "",
      profileDisplayName: "",
      profilePicture: "",
      profileNip05: "",
      profileAbout: "",
      presencePublishingEnabled: true,
      publishDelayEnabled: true,
      autoCaptionEnabled: true,
    },
    isSavingProfile: false,
    validation: {
      showProfileNameRequired: false,
      showProfileNameInvalid: false,
      showProfileNameTaken: false,
      isProfileNameValid: true,
    },
    setProfileName: () => {},
    setProfileDisplayName: () => {},
    setProfilePicture: () => {},
    setProfileNip05: () => {},
    setProfileAbout: () => {},
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

const relays: Relay[] = [
  { id: "demo", name: "Demo", icon: "D", isActive: true },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
];

const people: Person[] = [
  {
    id: "p1",
    name: "Alice",
    displayName: "Alice",
    avatar: "",
    isOnline: true,
    isSelected: false,
  },
];

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

  it("supports adding a new space", () => {
    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i), {
      target: { value: "wss://relay.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add space/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.add",
      url: "wss://relay.example.com",
    });
  });

  it("adds a new space when pressing Enter in relay input", () => {
    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
      />
    );

    const relayInput = screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i);
    fireEvent.change(relayInput, {
      target: { value: "relay.example.com" },
    });
    fireEvent.keyDown(relayInput, { key: "Enter" });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.add",
      url: "relay.example.com",
    });
  });

  it("uses cached kind:0 metadata for current user label when profile is missing", () => {
    const pubkey = "c".repeat(64);
    window.localStorage.setItem(
      "nodex.kind0.cache.v1",
      JSON.stringify([
        {
          kind: NostrEventKind.Metadata,
          pubkey,
          created_at: 123,
          content: JSON.stringify({ name: "Cached Carol" }),
        },
      ])
    );
    ndkMock.user = {
      pubkey,
      npub: "npub1carol",
      profile: { displayName: "" },
    };

    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
      />
    );

    expect(screen.getByText("Cached Carol")).toBeInTheDocument();
  });

  it("allows switching channel include match mode", () => {
    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        channelMatchMode="and"
        people={people}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /included channel match mode/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.channel.matchMode.change",
      mode: "or",
    });
  });

  it("renders app preferences outside the profile editor card", () => {
    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByText(/app preferences/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/share current status/i)).toBeInTheDocument();
    expect(screen.getByText(/broadcast your current view and active task/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/delay send so you can undo/i)).toBeInTheDocument();
    expect(screen.getByText(/delay nostr publish by a few seconds/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/generate image captions on this device/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/one-time model download may use roughly 30-80 mb/i)).not.toBeInTheDocument();
    expect(document.getElementById("manage-profile-presence-enabled")).toBeNull();
    expect(document.getElementById("manage-profile-publish-delay-enabled")).toBeNull();
    expect(document.getElementById("manage-profile-auto-caption-enabled")).toBeNull();
  });

  it("uses the shared guest private key row copy", () => {
    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
      />
    );

    expect(screen.getByText(/backup private key/i)).toBeInTheDocument();
    expect(screen.getByText(/keep secret/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show private key/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy private key/i })).toBeInTheDocument();
  });
});
