import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileCompletionDialog } from "./ProfileCompletionDialog";
import { FeedViewStateProvider } from "@/features/feed-page/views/feed-view-state-context";

const ndkMock = {
  user: {
    pubkey: "a".repeat(64),
    npub: "npub1test",
    profile: {},
  },
  hasWritableRelayConnection: false,
  needsProfileSetup: true,
  updateUserProfile: vi.fn(async () => true),
  publishEvent: vi.fn(async () => ({ success: true })),
};

const resetFromProfile = vi.fn();

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
    },
    fieldActions: {
      setUsername: vi.fn(),
      setDisplayName: vi.fn(),
      setPicture: vi.fn(),
      setNip05: vi.fn(),
      setAbout: vi.fn(),
    },
    isProfileDirty: false,
    isSavingProfile: false,
    validation: { usernameHint: null, isUsernameHintError: false, isUsernameValid: true },
    resetFromProfile,
    handleSaveProfile: vi.fn(async () => true),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
  },
}));

function renderDialog(profileCompletionPromptSignal: number) {
  return render(
    <FeedViewStateProvider
      value={{
        currentView: "feed",
        displayDepthMode: "1",
        isSidebarFocused: false,
        isOnboardingOpen: false,
        activeOnboardingStepId: null,
        isManageRouteActive: false,
        canCreateContent: true,
        profileCompletionPromptSignal,
        desktopSwipeHandlers: {},
      }}
    >
      <ProfileCompletionDialog />
    </FeedViewStateProvider>
  );
}

describe("ProfileCompletionDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    ndkMock.hasWritableRelayConnection = false;
    ndkMock.needsProfileSetup = true;
    ndkMock.user = {
      pubkey: "a".repeat(64),
      npub: "npub1test",
      profile: {},
    };
    resetFromProfile.mockClear();
  });

  it("stays silent during background prompts when no writable relay is connected", () => {
    renderDialog(1);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(resetFromProfile).not.toHaveBeenCalled();
  });

  it("opens once a writable relay becomes available for the same prompt signal", () => {
    const rendered = renderDialog(1);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    ndkMock.hasWritableRelayConnection = true;
    rendered.rerender(
      <FeedViewStateProvider
        value={{
          currentView: "feed",
          displayDepthMode: "1",
          isSidebarFocused: false,
          isOnboardingOpen: false,
          activeOnboardingStepId: null,
          isManageRouteActive: false,
          canCreateContent: true,
          profileCompletionPromptSignal: 1,
          desktopSwipeHandlers: {},
        }}
      >
        <ProfileCompletionDialog />
      </FeedViewStateProvider>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(resetFromProfile).toHaveBeenCalledTimes(1);
  });
});
