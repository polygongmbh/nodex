import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useKind0People } from "./use-kind0-people";
import { saveCachedKind0Events } from "./people-from-kind0";
import { DEMO_RELAY_URL } from "@/data/basic-nostr-events";
import { NostrEventKind } from "@/lib/nostr/types";

describe("useKind0People", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("derives people from selected relay kind0 cache without live task events", async () => {
    saveCachedKind0Events([
      {
        kind: NostrEventKind.Metadata,
        pubkey: "a".repeat(64),
        created_at: 1,
        content: JSON.stringify({
          name: "alice",
          displayName: "Alice Demo",
          nip05: "alice@example.com",
        }),
      },
    ], DEMO_RELAY_URL);

    const { result } = renderHook(() => useKind0People([], [DEMO_RELAY_URL], null));

    await waitFor(() => {
      expect(result.current.people).toHaveLength(1);
    });

    expect(result.current.people[0]).toEqual(
      expect.objectContaining({
        id: "a".repeat(64),
        name: "alice",
        displayName: "Alice Demo",
        nip05: "alice@example.com",
      })
    );
    expect(result.current.cachedKind0Events).toHaveLength(1);
  });
});
