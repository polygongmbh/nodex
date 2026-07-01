import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonHoverCard, resumePersonHoverCards, suspendPersonHoverCards } from "./PersonHoverCard";
import type { Person } from "@/types/person";
import {
  ingestPost,
  __resetPostsStoreForTests,
} from "@/features/feed-page/stores/posts-store";
import { PersonPresenceProvider } from "@/lib/person-presence-context";
import type { LatestPresenceSnapshot } from "@/lib/presence-status";
import { clearKind0Cache, makeTask, seedKind0Profile } from "@/test/fixtures";

const alice: Person = {
  pubkey: "a".repeat(64),
  name: "alice",
  displayName: "Alice",
  about: "Alice bio",
};

const bob: Person = {
  pubkey: "b".repeat(64),
  name: "bob",
  displayName: "Bob",
  about: "Bob bio",
};

describe("PersonHoverCard", () => {
  beforeEach(() => {
    clearKind0Cache();
    seedKind0Profile(alice.pubkey, { name: "alice", display_name: "Alice", about: "Alice bio" });
    seedKind0Profile(bob.pubkey, { name: "bob", display_name: "Bob", about: "Bob bio" });
  });

  afterEach(() => {
    vi.useRealTimers();
    resumePersonHoverCards();
    __resetPostsStoreForTests();
  });

  it("closes an already-open profile preview when another one opens", () => {
    vi.useFakeTimers();

    render(
      <>
        <PersonHoverCard pubkey={alice.pubkey}>
          <button type="button">Alice trigger</button>
        </PersonHoverCard>
        <PersonHoverCard pubkey={bob.pubkey}>
          <button type="button">Bob trigger</button>
        </PersonHoverCard>
      </>
    );

    const aliceTrigger = screen.getByRole("button", { name: "Alice trigger" });
    const bobTrigger = screen.getByRole("button", { name: "Bob trigger" });

    fireEvent.focus(aliceTrigger);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();

    fireEvent.focus(bobTrigger);
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("prefers the currently hovered trigger over a previously focused one", () => {
    vi.useFakeTimers();

    render(
      <>
        <PersonHoverCard pubkey={alice.pubkey}>
          <button type="button">Alice trigger</button>
        </PersonHoverCard>
        <PersonHoverCard pubkey={bob.pubkey}>
          <button type="button">Bob trigger</button>
        </PersonHoverCard>
      </>
    );

    const aliceTrigger = screen.getByRole("button", { name: "Alice trigger" });
    const bobTrigger = screen.getByRole("button", { name: "Bob trigger" });

    fireEvent.focus(aliceTrigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();

    fireEvent.mouseOver(bobTrigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("does not open a pending hover card while person overlays are suspended", () => {
    vi.useFakeTimers();

    render(
      <PersonHoverCard pubkey={alice.pubkey}>
        <button type="button">Alice trigger</button>
      </PersonHoverCard>
    );

    const trigger = screen.getByRole("button", { name: "Alice trigger" });

    fireEvent.mouseOver(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    suspendPersonHoverCards();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("shows presence details and resolves the viewed task title", () => {
    vi.useFakeTimers();

    const presenceByAuthor = new Map<string, LatestPresenceSnapshot>([
      [
        alice.pubkey,
        {
          state: "active",
          reportedAtMs: new Date("2026-04-04T11:58:00.000Z").getTime(),
          view: "feed",
          taskId: "task-123",
        },
      ],
    ]);
    ingestPost({ post: makeTask({ id: "task-123", content: "Fix relay reconnect jitter" }) });

    render(
      <PersonPresenceProvider
        latestPresenceByAuthor={presenceByAuthor}
        now={new Date("2026-04-04T11:59:00.000Z")}
      >
        <PersonHoverCard pubkey={alice.pubkey}>
          <button type="button">Alice trigger</button>
        </PersonHoverCard>
      </PersonPresenceProvider>
    );

    fireEvent.focus(screen.getByRole("button", { name: "Alice trigger" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByText("Fix relay reconnect jitter")).toBeInTheDocument();
    expect(screen.queryByText("Timeline")).not.toBeInTheDocument();
  });

  it("falls back to the current view when a presence task id is not in the current task model", () => {
    vi.useFakeTimers();

    const presenceByAuthor = new Map<string, LatestPresenceSnapshot>([
      [
        alice.pubkey,
        {
          state: "active",
          reportedAtMs: new Date("2026-04-04T11:58:00.000Z").getTime(),
          view: "tree",
          taskId: "missing-task",
        },
      ],
    ]);

    render(
      <PersonPresenceProvider
        latestPresenceByAuthor={presenceByAuthor}
        now={new Date("2026-04-04T11:59:00.000Z")}
      >
        <PersonHoverCard pubkey={alice.pubkey}>
          <button type="button">Alice trigger</button>
        </PersonHoverCard>
      </PersonPresenceProvider>
    );

    fireEvent.focus(screen.getByRole("button", { name: "Alice trigger" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByText("Tree")).toBeInTheDocument();
    expect(screen.queryByText("Unknown task")).not.toBeInTheDocument();
  });

  it("reads presence from the shared context so it cannot disagree with the sidebar", () => {
    vi.useFakeTimers();

    const presenceByAuthor = new Map<string, LatestPresenceSnapshot>([
      [
        alice.pubkey,
        {
          state: "active",
          reportedAtMs: new Date("2026-04-04T11:58:00.000Z").getTime(),
          view: "feed",
        },
      ],
    ]);

    render(
      <PersonPresenceProvider
        latestPresenceByAuthor={presenceByAuthor}
        now={new Date("2026-04-04T11:59:00.000Z")}
      >
        <PersonHoverCard pubkey={alice.pubkey}>
          <button type="button">Alice trigger</button>
        </PersonHoverCard>
      </PersonPresenceProvider>
    );

    fireEvent.focus(screen.getByRole("button", { name: "Alice trigger" }));
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByText("online")).toBeInTheDocument();
  });
});
