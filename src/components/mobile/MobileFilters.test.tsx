import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileFilters } from "./MobileFilters";
import type { Channel, Person, Relay } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";

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

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ndkMock,
}));

vi.mock("@/components/layout/VersionHint", () => ({
  VersionHint: () => <button type="button">v2.0.0</button>,
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
    ndkMock.user = {
      pubkey: "abc123",
      npub: "npub1abc",
      profile: { displayName: "Guest User" },
    };
  });

  it("supports adding a new feed and showing profile controls", () => {
    const onAddRelay = vi.fn();

    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        onAddRelay={onAddRelay}
        onRemoveRelay={() => {}}
        onSignInClick={() => {}}
        onGuideClick={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i), {
      target: { value: "wss://relay.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add feed/i }));

    expect(onAddRelay).toHaveBeenCalledWith("wss://relay.example.com");
    expect(screen.getByRole("button", { name: /copy private key/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /open imprint and privacy policy/i })).toHaveLength(2);
    expect(screen.getByRole("link", { name: /kontakt per e-mail/i })).toBeInTheDocument();
    // Keep manage panel height-bound so content scrolls within mobile view.
    expect(document.querySelector('[data-onboarding="mobile-filters"]')).toHaveClass("h-full");
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
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
        onSignInClick={() => {}}
        onGuideClick={() => {}}
      />
    );

    expect(screen.getByText("Cached Carol")).toBeInTheDocument();
  });

  it("allows switching channel include match mode", () => {
    const onChannelMatchModeChange = vi.fn();

    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        channelMatchMode="and"
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        onChannelMatchModeChange={onChannelMatchModeChange}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
        onSignInClick={() => {}}
        onGuideClick={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /included channel match mode/i }));

    expect(onChannelMatchModeChange).toHaveBeenCalledWith("or");
  });

  it("renders app preferences outside the profile editor card", () => {
    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        onAddRelay={() => {}}
        onRemoveRelay={() => {}}
        onSignInClick={() => {}}
        onGuideClick={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.getByText(/app preferences/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/share live status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow undo before sending/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/enable local image captions/i)).toBeInTheDocument();
    expect(document.getElementById("manage-profile-presence-enabled")).toBeNull();
    expect(document.getElementById("manage-profile-publish-delay-enabled")).toBeNull();
    expect(document.getElementById("manage-profile-auto-caption-enabled")).toBeNull();
  });
});
