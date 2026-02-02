// Nostr Protocol Implementation
// Based on NIP-01: Basic protocol flow description
// https://github.com/nostr-protocol/nips/blob/master/01.md

export {
  NostrRelayPool,
  getRelayPool,
  resetRelayPool,
  type RelayPoolConfig,
  type RelayPoolEvents,
  type NostrEventWithRelay,
} from "./relay-pool";

export type {
  NostrEvent,
  NostrFilter,
  NostrClientMessage,
  NostrRelayMessage,
  RelayConnection,
  RelayStatus,
  SubscriptionOptions,
  PublishResult,
  UnsignedEvent,
} from "./types";

export { NostrEventKind } from "./types";

export {
  generateSubscriptionId,
  createUnsignedEvent,
  signEvent,
  validateEvent,
  extractMentions,
  extractReferences,
  extractHashtags,
  formatPubkey,
  formatRelativeTime,
} from "./utils";

export {
  nostrEventToTask,
  nostrEventsToTasks,
  mergeTasks,
  eventHasTags,
  extractAllTags,
  getRelayIdFromUrl,
  getRelayNameFromUrl,
  isSpamContent,
} from "./event-converter";
