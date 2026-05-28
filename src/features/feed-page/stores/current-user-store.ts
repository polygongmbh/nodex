import { create } from "zustand";
import type { Person } from "@/types/person";

interface CurrentUserState {
  currentUser: Person | undefined;
  setCurrentUser: (value: Person | undefined) => void;
}

/**
 * The Person record for the signed-in user, resolved via
 * `resolveCurrentUser(people, ndkUser)` at Index. Leaves consume via
 * `useCurrentUser()`.
 *
 * Distinct from `useNDK().user` (which is the NDK auth handle) — this
 * is the matched profile entry from the kind-0 / people set.
 */
export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  currentUser: undefined,
  setCurrentUser: (value) => set({ currentUser: value }),
}));

export const useCurrentUser = () => useCurrentUserStore((s) => s.currentUser);
