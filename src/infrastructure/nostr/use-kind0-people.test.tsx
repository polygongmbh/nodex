import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKind0People } from "./use-kind0-people";
import * as peopleFromKind0 from "./people-from-kind0";
import { DEMO_RELAY_URL } from "@/data/basic-nostr-events";
import { NostrEventKind } from "@/lib/nostr/types";
import { makePerson } from "@/test/fixtures";

describe("useKind0People", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("derives people from selected relay kind0 cache without live task events", async () => {
    peopleFromKind0.saveCachedKind0Events([
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

  it("does not refresh selected relay cache when rerendered with an equivalent normalized relay list", async () => {
    const loadSpy = vi.spyOn(peopleFromKind0, "loadCachedKind0EventsForRelayUrls");

    const { rerender } = renderHook(
      ({ relayUrls }) => useKind0People([], relayUrls, null),
      {
        initialProps: { relayUrls: [DEMO_RELAY_URL] },
      }
    );

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2);
    });

    rerender({ relayUrls: [` ${DEMO_RELAY_URL}/`, DEMO_RELAY_URL] });

    await waitFor(() => {
      expect(loadSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("preserves interactive people selection across semantically unchanged rerenders", async () => {
    peopleFromKind0.saveCachedKind0Events([
      {
        kind: NostrEventKind.Metadata,
        pubkey: "a".repeat(64),
        created_at: 1,
        content: JSON.stringify({
          name: "alice",
          displayName: "Alice Demo",
        }),
      },
    ], DEMO_RELAY_URL);

    const { result, rerender } = renderHook(
      ({ relayUrls }) => useKind0People([], relayUrls, null),
      {
        initialProps: { relayUrls: [DEMO_RELAY_URL] },
      }
    );

    await waitFor(() => {
      expect(result.current.people).toHaveLength(1);
    });

    act(() => {
      result.current.setPeople((previous) =>
        previous.map((person) =>
          person.id === "a".repeat(64) ? { ...person, isSelected: true } : person
        )
      );
    });

    expect(result.current.people[0]?.isSelected).toBe(true);

    act(() => {
      result.current.setPeople((previous) => [
        ...previous,
        makePerson({ id: "manual", name: "manual", displayName: "Manual Person", isSelected: true }),
      ]);
    });

    rerender({ relayUrls: [` ${DEMO_RELAY_URL}/`, DEMO_RELAY_URL] });

    await waitFor(() => {
      expect(result.current.people.find((person) => person.id === "a".repeat(64))?.isSelected).toBe(true);
      expect(result.current.people.find((person) => person.id === "manual")).toEqual(
        expect.objectContaining({ isSelected: true, displayName: "Manual Person" })
      );
    });
  });

  it("does not rewrite kind0 relay cache when unrelated live events arrive", async () => {
    const saveSpy = vi.spyOn(peopleFromKind0, "saveCachedKind0Events");
    const metadataEvent = {
      id: "kind0-event",
      pubkey: "a".repeat(64),
      created_at: 1,
      kind: NostrEventKind.Metadata,
      tags: [],
      content: JSON.stringify({
        name: "alice",
        displayName: "Alice Demo",
      }),
      relayUrl: DEMO_RELAY_URL,
      relayUrls: [DEMO_RELAY_URL],
    };
    const textNoteEvent = {
      id: "text-event",
      pubkey: "b".repeat(64),
      created_at: 2,
      kind: NostrEventKind.TextNote,
      tags: [],
      content: "hello",
      relayUrl: DEMO_RELAY_URL,
      relayUrls: [DEMO_RELAY_URL],
    };

    const { rerender } = renderHook(
      ({ events }) => useKind0People(events, [DEMO_RELAY_URL], null),
      {
        initialProps: { events: [metadataEvent] },
      }
    );

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    rerender({ events: [metadataEvent, textNoteEvent] });

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });
});
