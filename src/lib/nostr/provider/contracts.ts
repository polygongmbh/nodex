import type { NDK, NDKEvent, NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk";
import type { ReactNode } from "react";
import type { EditableNostrProfile } from "../profile-metadata";
import { NostrEventKind } from "../types";

export type AuthMethod = "extension" | "privateKey" | "guest" | "nostrConnect" | null;

export interface NostrUser {
  pubkey: string;
  npub: string;
  profile?: {
    name?: string;
    displayName?: string;
    picture?: string;
    about?: string;
    nip05?: string;
    nip05Verified?: boolean;
  };
}

export interface NDKRelayStatus {
  url: string;
  status: "connected" | "read-only" | "connecting" | "disconnected" | "connection-error" | "verification-failed";
  latency?: number;
  nip11?: {
    authRequired: boolean;
    supportsNip42: boolean;
    checkedAt: number;
  };
}

export interface NDKContextValue {
  ndk: NDK | null;
  isConnected: boolean;
  relays: NDKRelayStatus[];
  user: NostrUser | null;
  authMethod: AuthMethod;
  isAuthenticating: boolean;
  loginWithExtension: () => Promise<boolean>;
  loginWithPrivateKey: (nsecOrHex: string) => Promise<boolean>;
  loginAsGuest: () => Promise<boolean>;
  loginWithNostrConnect: (bunkerUrl: string) => Promise<boolean>;
  logout: () => void;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  publishEvent: (
    kind: NostrEventKind,
    content: string,
    tags?: string[][],
    parentId?: string,
    relayUrls?: string[]
  ) => Promise<{ success: boolean; eventId?: string }>;
  createHttpAuthHeader: (
    url: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  ) => Promise<string | null>;
  updateUserProfile: (profile: EditableNostrProfile) => Promise<boolean>;
  needsProfileSetup: boolean;
  isProfileSyncing: boolean;
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
  getGuestPrivateKey: () => string | null;
}

export interface NDKProviderProps {
  children: ReactNode;
  defaultRelays?: string[];
}
