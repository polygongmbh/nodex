import type { Person } from "@/types";
import { parseKind0Content } from "./nostr/profile-metadata";
import { NostrEventKind } from "./nostr/types";

interface Kind0LikeEvent {
  kind: number;
  pubkey: string;
  created_at?: number;
  content: string;
}

export function derivePeopleFromKind0Events(
  events: Kind0LikeEvent[],
  previousPeople: Person[]
): Person[] {
  const previousSelection = new Map(previousPeople.map((person) => [person.id, person.isSelected]));
  const latestByPubkey = new Map<string, Kind0LikeEvent>();

  for (const event of events) {
    if (event.kind !== NostrEventKind.Metadata) continue;
    const current = latestByPubkey.get(event.pubkey);
    if (!current || (event.created_at || 0) >= (current.created_at || 0)) {
      latestByPubkey.set(event.pubkey, event);
    }
  }

  const people = Array.from(latestByPubkey.entries()).map(([pubkey, event]) => {
    const parsed = parseKind0Content(event.content);
    const name = (parsed.name || parsed.displayName || pubkey.slice(0, 8)).trim();
    const displayName = (parsed.displayName || parsed.name || `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`).trim();

    return {
      id: pubkey,
      name,
      displayName,
      nip05: parsed.nip05?.trim().toLowerCase(),
      avatar: parsed.picture,
      isOnline: true,
      isSelected: previousSelection.get(pubkey) || false,
    } satisfies Person;
  });

  return people.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
