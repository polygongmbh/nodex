import type NDK from "@nostr-dev-kit/ndk";
import type { NDKEvent, NDKFilter, NDKSubscription, NDKUser } from "@nostr-dev-kit/ndk";
import type { ReactNode } from "react";
import type { NoasAuthResult } from "@/lib/nostr/noas-client";
import type { EditableNostrProfile } from "@/infrastructure/nostr/profile-metadata";
import { NostrEventKind } from "@/lib/nostr/types";

export type AuthMethod = "extension" | "privateKey" | "guest" | "nostrConnect" | "noas" | null;

export function mapNdkUser(ndkUser: NDKUser): NostrUser {
  const { pubkey, npub } = ndkUser;
  if (!ndkUser.profile) return { pubkey, npub };
  const { name, displayName, picture, about, nip05 } = ndkUser.profile;
  return { pubkey, npub, profile: { name, displayName, picture, about, nip05 } };
}

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
  hasWritableRelayConnection: boolean;
  relays: NDKRelayStatus[];
  defaultNoasHostUrl: string;
  user: NostrUser | null;
  authMethod: AuthMethod;
  isAuthenticating: boolean;
  loginWithExtension: () => Promise<boolean>;
  loginWithPrivateKey: (nsecOrHex: string) => Promise<boolean>;
  loginAsGuest: () => Promise<boolean>;
  loginWithNostrConnect: (bunkerUrl: string) => Promise<boolean>;
  loginWithNoas: (
    username: string,
    password: string,
    config?: { baseUrl?: string }
  ) => Promise<NoasAuthResult>;
  signupWithNoas: (
    username: string,
    password: string,
    privateKey: string,
    pubkey: string,
    config?: { baseUrl?: string }
  ) => Promise<NoasAuthResult>;
  logout: () => void;
  addRelay: (url: string) => void;
  reorderRelays: (orderedUrls: string[]) => void;
  removeRelay: (url: string) => void;
  reconnectRelay: (url: string, options?: { forceNewSocket?: boolean }) => void;
  setPresenceRelayUrls: (relayUrls: string[]) => void;
  publishEvent: (
    kind: NostrEventKind,
    content: string,
    tags?: string[][],
    parentId?: string,
    relayUrls?: string[]
  ) => Promise<{ success: boolean; eventId?: string; rejectionReason?: string; publishedRelayUrls?: string[] }>;
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
  defaultNoasHostUrl?: string;
}
