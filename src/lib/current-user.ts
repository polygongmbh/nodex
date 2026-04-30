import type { Person } from "@/types/person";

interface AuthUserLike {
  pubkey: string;
}

export function resolveCurrentUser(
  people: Person[],
  authUser?: AuthUserLike | null
): Person | undefined {
  if (authUser?.pubkey) {
    const byPubkey = people.find((person) => person.pubkey === authUser.pubkey);
    if (byPubkey) return byPubkey;
  }

  const byName = people.find((person) => person.name.toLowerCase() === "me");
  if (byName) return byName;

  return people[0];
}
