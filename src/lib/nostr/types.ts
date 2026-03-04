// Nostr Protocol Types (NIP-01)

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: NostrEventKind;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrEventWithRelay extends NostrEvent {
  relayUrl?: string;
  relayUrls?: string[];
}

export enum NostrEventKind {
  Metadata = 0,
  TextNote = 1,
  RecommendRelay = 2,
  Contacts = 3,
  EncryptedDirectMessage = 4,
  EventDeletion = 5,
  Repost = 6,
  Reaction = 7,
  ChannelCreation = 40,
  ChannelMetadata = 41,
  ChannelMessage = 42,
  ChannelHideMessage = 43,
  ChannelMuteUser = 44,
  HttpAuth = 27235,
  Auth = 22242, // NIP-42 Authentication
  // Task-related kinds
  Task = 1621,
  GitStatusOpen = 1630,
  GitStatusApplied = 1631,
  GitStatusClosed = 1632,
  GitStatusDraft = 1633,
  Procedure = 1639,
  ClassifiedListing = 30402,
  ClassifiedListingDraft = 30403,
  CalendarDateBased = 31922,
  CalendarTimeBased = 31923,
  UserStatus = 30315,
}

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: NostrEventKind[];
  "#e"?: string[];
  "#p"?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

// Relay message types (client to relay)
export type NostrClientMessage =
  | ["EVENT", NostrEvent]
  | ["REQ", string, ...NostrFilter[]]
  | ["CLOSE", string];

// Relay message types (relay to client)
export type NostrRelayMessage =
  | ["EVENT", string, NostrEvent]
  | ["OK", string, boolean, string]
  | ["EOSE", string]
  | ["NOTICE", string]
  | ["CLOSED", string, string];

export interface RelayConnection {
  url: string;
  status: RelayStatus;
  lastConnected?: Date;
  lastError?: string;
}

export type RelayStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SubscriptionOptions {
  id: string;
  filters: NostrFilter[];
  onEvent: (event: NostrEvent) => void;
  onEose?: () => void;
  onError?: (error: string) => void;
}

export interface PublishResult {
  success: boolean;
  eventId: string;
  relay: string;
  message?: string;
}

// Unsigned event for creation before signing
export interface UnsignedEvent {
  pubkey: string;
  created_at: number;
  kind: NostrEventKind;
  tags: string[][];
  content: string;
}
