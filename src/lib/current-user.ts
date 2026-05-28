import type { Person } from "@/types/person";

interface AuthUserLike {
  pubkey: string;
}

export function resolveCurrentUser(
  people: Person[],
  authUser?: AuthUserLike | null
): Person | undefined {
  if (!authUser?.pubkey) return undefined;
  return people.find((person) => person.pubkey === authUser.pubkey);
}
