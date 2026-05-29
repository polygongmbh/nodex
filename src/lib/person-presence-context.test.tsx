import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PersonPresenceProvider, usePersonPresence } from "./person-presence-context";
import { PRESENCE_RECENT_WINDOW_MS, type LatestPresenceSnapshot } from "./presence-status";

const selfPubkey = "s".repeat(64);
const otherPubkey = "o".repeat(64);

function PresenceProbe({ pubkey, onResolve }: { pubkey: string; onResolve: (state: string | undefined) => void }) {
  const snapshot = usePersonPresence(pubkey);
  onResolve(snapshot?.state);
  return null;
}

describe("PersonPresenceProvider self override", () => {
  it("marks the current user as online even when their last presence event is far past the recent window", () => {
    const now = new Date("2026-05-29T16:50:00Z");
    const longAgoMs = now.getTime() - (PRESENCE_RECENT_WINDOW_MS + 60_000);
    const latestPresenceByAuthor = new Map<string, LatestPresenceSnapshot>([
      [
        selfPubkey,
        { reportedAtMs: longAgoMs, state: "active", view: "feed", taskId: null },
      ],
    ]);

    const states: Record<string, string | undefined> = {};
    render(
      <PersonPresenceProvider
        latestPresenceByAuthor={latestPresenceByAuthor}
        now={now}
        currentUserPubkey={selfPubkey}
      >
        <PresenceProbe pubkey={selfPubkey} onResolve={(s) => { states.self = s; }} />
      </PersonPresenceProvider>
    );

    expect(states.self).toBe("online");
  });

  it("does not override other users — only the configured self pubkey", () => {
    const now = new Date("2026-05-29T16:50:00Z");
    const longAgoMs = now.getTime() - (PRESENCE_RECENT_WINDOW_MS + 60_000);
    const latestPresenceByAuthor = new Map<string, LatestPresenceSnapshot>([
      [
        otherPubkey,
        { reportedAtMs: longAgoMs, state: "active", view: "feed", taskId: null },
      ],
    ]);

    const states: Record<string, string | undefined> = {};
    render(
      <PersonPresenceProvider
        latestPresenceByAuthor={latestPresenceByAuthor}
        now={now}
        currentUserPubkey={selfPubkey}
      >
        <PresenceProbe pubkey={otherPubkey} onResolve={(s) => { states.other = s; }} />
      </PersonPresenceProvider>
    );

    expect(states.other).toBe("offline");
  });

  it("falls back to evaluatedAt timestamp when self has never published presence", () => {
    const now = new Date("2026-05-29T16:50:00Z");

    let reportedAtMs: number | undefined;
    function ReportedAtProbe() {
      const snap = usePersonPresence(selfPubkey);
      reportedAtMs = snap?.reportedAtMs;
      return null;
    }

    render(
      <PersonPresenceProvider
        latestPresenceByAuthor={new Map()}
        now={now}
        currentUserPubkey={selfPubkey}
      >
        <ReportedAtProbe />
      </PersonPresenceProvider>
    );

    expect(reportedAtMs).toBe(now.getTime());
  });
});
