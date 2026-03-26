import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  Hash,
  Calendar,
  Clock,
  X,
  AtSign,
  AlertTriangle,
  Flag,
  CheckSquare,
  MessageSquare,
  Package,
  HandHelping,
  LocateFixed,
  MapPin,
  LogIn,
  Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Relay,
  Channel,
  Person,
  FeedMessageType,
  Nip99Metadata,
  TaskType,
  TaskDateType,
  TaskCreateResult,
  ComposerSubmit,
  ComposeRestoreRequest,
  ComposeAttachment,
  PublishedAttachment,
} from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  extractMentionIdentifiersFromContent,
  formatMentionIdentifierForDisplay,
  getMentionAliases,
  getPreferredMentionIdentifier,
  personMatchesMentionQuery,
} from "@/lib/mentions";
import { hasMeaningfulComposerText } from "@/lib/composer-content";
import { notifyNeedTag, notifyTaskCreationFailed } from "@/lib/notifications";
import {
  isAlternateSubmitKey,
  isAutocompleteAcceptKey,
  isMetadataOnlyAutocompleteClick,
  isMetadataOnlyAutocompleteKey,
  isPrimarySubmitKey,
} from "@/lib/composer-shortcuts";
import { getAttachmentMaxFileSizeBytes, isAttachmentUploadConfigured, uploadAttachment } from "@/lib/nostr/nip96-attachment-upload";
import { loadAutoCaptionEnabled } from "@/infrastructure/preferences/user-preferences-storage";
import { featureDebugLog } from "@/lib/feature-debug";
import { generateLocalImageCaption, notifyAutoCaptionFailureOnce } from "@/lib/local-image-caption";
import { DEFAULT_GEOHASH_PRECISION, encodeGeohash, normalizeGeohash } from "@/infrastructure/nostr/geohash-location";
import { countHashtagsInContent, extractHashtagsFromContent, getHashtagQueryAtCursor } from "@/lib/hashtags";
import { filterChannelsForAutocomplete, getComposerAutocompleteMatch, hasMentionQueryAtCursor } from "@/lib/composer-autocomplete";
import { resolveComposeSubmitBlock } from "@/lib/compose-submit-block";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { useAuthActionPolicy } from "@/features/auth/controllers/use-auth-action-policy";
import { useFeedComposerOptions } from "@/features/feed-page/views/feed-surface-context";

interface TaskComposerProps {
  onSubmit: ComposerSubmit;
  relays?: Relay[];
  channels?: Channel[];
  people?: Person[];
  onCancel: () => void;
  compact?: boolean;
  defaultDueDate?: Date;
  defaultContent?: string;
  parentId?: string;
  adaptiveSize?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  draftStorageKey?: string;
  forceExpanded?: boolean;
  forceExpandSignal?: number;
  mentionRequest?: {
    mention: string;
    id: number;
  } | null;
  allowComment?: boolean;
  allowFeedMessageTypes?: boolean;
  composeRestoreRequest?: ComposeRestoreRequest | null;
}

type ComposerMessageType = TaskType | FeedMessageType;

interface ComposeDraftState {
  content?: string;
  taskType?: ComposerMessageType;
  messageType?: ComposerMessageType;
  dueDate?: string;
  dueTime?: string;
  dateType?: TaskDateType;
  selectedRelays?: string[];
  explicitMentionPubkeys?: string[];
  explicitTagNames?: string[];
  priority?: number;
  attachments?: PublishedAttachment[];
  nip99?: Nip99Metadata;
  locationGeohash?: string;
}

const NIP99_TITLE_MAX_LENGTH = 80;
const NIP99_SUMMARY_MAX_LENGTH = 160;
const COMMON_NIP99_CURRENCY_CODES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF"];
const COMPOSER_MAX_VIEWPORT_HEIGHT_RATIO = 0.5;

function normalizeListingTextFromContent(content: string): string {
  return content
    .replace(/(^|\s)#\w+/g, " ")
    .replace(/(^|\s)@[^\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateWordSafe(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const truncated = value.slice(0, maxLength).trim();
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return truncated.slice(0, lastSpace).trim();
  }
  return truncated;
}

function deriveNip99AutofillFromContent(content: string): Pick<Nip99Metadata, "title" | "summary"> {
  const normalized = normalizeListingTextFromContent(content);
  if (!normalized) {
    return { title: undefined, summary: undefined };
  }
  if (normalized.length <= NIP99_TITLE_MAX_LENGTH) {
    return { title: normalized, summary: undefined };
  }
  if (normalized.length <= NIP99_SUMMARY_MAX_LENGTH) {
    return {
      title: truncateWordSafe(normalized, NIP99_TITLE_MAX_LENGTH),
      summary: normalized,
    };
  }
  return {
    title: truncateWordSafe(normalized, NIP99_TITLE_MAX_LENGTH),
    summary: truncateWordSafe(normalized, NIP99_SUMMARY_MAX_LENGTH),
  };
}

function readComposeDraft(key: string): ComposeDraftState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposeDraftState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

const isPostableRelay = (r: Relay) =>
  r.connectionStatus === undefined || r.connectionStatus === "connected" || r.connectionStatus === "read-only";

function extractFilesFromDataTransfer(dataTransfer: DataTransfer | null | undefined): File[] {
  if (!dataTransfer) return [];
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
  }
  return Array.from(dataTransfer.files || []);
}

function hasFilesInDataTransfer(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items).some((item) => item.kind === "file");
  }
  return Array.from(dataTransfer.types || []).includes("Files") || (dataTransfer.files?.length || 0) > 0;
}

function extractPlainTextFromDataTransfer(dataTransfer: DataTransfer | null | undefined): string {
  if (!dataTransfer) return "";
  const text = dataTransfer.getData("text/plain");
  return typeof text === "string" ? text : "";
}

export function TaskComposer({
  onSubmit,
  relays: relaysProp,
  channels: channelsProp,
  people: peopleProp,
  onCancel, 
  compact = false, 
  defaultDueDate, 
  defaultContent = "",
  parentId,
  adaptiveSize = false,
  onExpandedChange,
  draftStorageKey,
  forceExpanded = false,
  forceExpandSignal,
  mentionRequest = null,
  allowComment = true,
  allowFeedMessageTypes = false,
  composeRestoreRequest = null,
}: TaskComposerProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const composerOptions = useFeedComposerOptions();
  const relays = relaysProp ?? composerOptions.relays;
  const channels = channelsProp ?? composerOptions.channels;
  const people = peopleProp ?? composerOptions.people;
  const mentionablePeople = peopleProp ?? composerOptions.mentionablePeople ?? people;
  const { user, createHttpAuthHeader } = useNDK();
  const authPolicy = useAuthActionPolicy();
  const includedChannels = channels
    .filter((c) => c.filterState === "included")
    .map((c) => c.name.trim().toLowerCase())
    .filter(Boolean);
  const selectedPeoplePubkeys = people
    .filter((person) => person.isSelected)
    .map((person) => person.id.trim().toLowerCase())
    .filter((value) => /^[a-f0-9]{64}$/i.test(value));
  const initialDraft = draftStorageKey ? readComposeDraft(draftStorageKey) : null;
  const initialContent = initialDraft?.content ?? defaultContent;
  
  const [content, setContent] = useState(initialContent);
  const [taskType, setTaskType] = useState<ComposerMessageType>(() => {
    const draftMessageType = initialDraft?.messageType;
    if (draftMessageType === "task" || draftMessageType === "comment") return draftMessageType;
    if (allowFeedMessageTypes && (draftMessageType === "offer" || draftMessageType === "request")) {
      return draftMessageType;
    }
    return initialDraft?.taskType === "comment" ? "comment" : "task";
  });
  const [selectedRelays, setSelectedRelays] = useState<string[]>(() => {
    if (initialDraft?.selectedRelays && Array.isArray(initialDraft.selectedRelays)) {
      return initialDraft.selectedRelays.filter((id): id is string => typeof id === "string");
    }
    return relays.filter(r => r.isActive && isPostableRelay(r)).map(r => r.id);
  });
  const [dueDate, setDueDate] = useState<Date | undefined>(() => {
    if (initialDraft?.dueDate) {
      const parsedDate = new Date(initialDraft.dueDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    return defaultDueDate;
  });
  const [dueTime, setDueTime] = useState(initialDraft?.dueTime || "");
  const [dateType, setDateType] = useState<TaskDateType>(initialDraft?.dateType || "due");
  const [showHashtagSuggestions, setShowHashtagSuggestions] = useState(false);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [hashtagFilter, setHashtagFilter] = useState("");
  const [mentionFilter, setMentionFilter] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSendLaunching, setIsSendLaunching] = useState(false);
  const [explicitTagNames, setExplicitTagNames] = useState<string[]>(() => {
    if (!initialDraft?.explicitTagNames || !Array.isArray(initialDraft.explicitTagNames)) {
      return [];
    }
    return initialDraft.explicitTagNames
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  });
  const [explicitMentionPubkeys, setExplicitMentionPubkeys] = useState<string[]>(() => {
    if (!initialDraft?.explicitMentionPubkeys || !Array.isArray(initialDraft.explicitMentionPubkeys)) {
      return [];
    }
    return initialDraft.explicitMentionPubkeys
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => /^[a-f0-9]{64}$/i.test(value));
  });
  const [priority, setPriority] = useState<number | undefined>(() => {
    if (typeof initialDraft?.priority !== "number") return undefined;
    return Number.isFinite(initialDraft.priority) ? initialDraft.priority : undefined;
  });
  const [attachments, setAttachments] = useState<ComposeAttachment[]>(() => {
    const initial = initialDraft?.attachments || [];
    return initial.map((attachment, index) => ({
      id: `draft-${index}-${Date.now().toString(36)}`,
      fileName: attachment.name || attachment.url,
      status: "uploaded",
      source: "url",
      ...attachment,
    }));
  });
  const [nip99, setNip99] = useState<Nip99Metadata>(() => ({ ...(initialDraft?.nip99 || {}) }));
  const [locationGeohash, setLocationGeohash] = useState<string | undefined>(() => normalizeGeohash(initialDraft?.locationGeohash));
  const [showLocationControls, setShowLocationControls] = useState<boolean>(
    () => Boolean(normalizeGeohash(initialDraft?.locationGeohash))
  );
  const [isNip99TitleTouched, setIsNip99TitleTouched] = useState(
    () => Boolean(initialDraft?.nip99?.title?.trim())
  );
  const [isNip99SummaryTouched, setIsNip99SummaryTouched] = useState(
    () => Boolean(initialDraft?.nip99?.summary?.trim())
  );
  const [isExpanded, setIsExpanded] = useState(
    () => !adaptiveSize || initialContent.trim().length > 0
  );
  const uploadEnabled = isAttachmentUploadConfigured();
  const attachmentMaxFileSizeBytes = getAttachmentMaxFileSizeBytes();
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const blockerPanelRef = useRef<HTMLDivElement>(null);
  const dueDatePopoverContentRef = useRef<HTMLDivElement>(null);
  const attachmentFileRef = useRef<Record<string, File>>({});
  const internalMouseDownWithinComposerRef = useRef(false);
  const pendingOutsidePointerInteractionRef = useRef(false);
  const sendLaunchTimeoutRef = useRef<number | null>(null);
  const remediationHighlightTimeoutRef = useRef<number | null>(null);
  const prevIncludedChannelsRef = useRef<string[]>([]);
  const prevSelectedPeoplePubkeysRef = useRef<string[]>([]);
  const autoManagedFilterTagNamesRef = useRef<Set<string>>(new Set());
  const autoManagedFilterMentionPubkeysRef = useRef<Set<string>>(new Set());
  const lastForceExpandSignalRef = useRef<number | undefined>(undefined);
  const lastAppliedRestoreRequestIdRef = useRef<number | null>(null);
  const dragDepthRef = useRef(0);
  const [highlightedTarget, setHighlightedTarget] = useState<"input" | "attachments" | "blocker" | null>(null);
  const [isDraggingFilesOverComposer, setIsDraggingFilesOverComposer] = useState(false);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const maxHeight = Math.max(window.innerHeight * COMPOSER_MAX_VIEWPORT_HEIGHT_RATIO, 42);
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.maxHeight = `${maxHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [content, adaptiveSize, compact, isExpanded]);

  useEffect(() => {
    const handleResize = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const maxHeight = Math.max(window.innerHeight * COMPOSER_MAX_VIEWPORT_HEIGHT_RATIO, 42);
      textarea.style.height = "0px";
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.maxHeight = `${maxHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const hasMention = (text: string, mention: string) => {
    const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(text);
  };

  useEffect(() => {
    return () => {
      if (sendLaunchTimeoutRef.current !== null) {
        window.clearTimeout(sendLaunchTimeoutRef.current);
        sendLaunchTimeoutRef.current = null;
      }
      if (remediationHighlightTimeoutRef.current !== null) {
        window.clearTimeout(remediationHighlightTimeoutRef.current);
        remediationHighlightTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!adaptiveSize) {
      textareaRef.current?.focus();
    }
  }, [adaptiveSize]);

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  useEffect(() => {
    if (!adaptiveSize || !isExpanded || content.trim()) return;

    const isOutsideComposer = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      if (composerRef.current?.contains(target)) return false;
      if (dueDatePopoverContentRef.current?.contains(target)) return false;
      return true;
    };

    const handleDocumentMouseDown = (event: MouseEvent) => {
      pendingOutsidePointerInteractionRef.current = isOutsideComposer(event.target);
    };

    const handleDocumentClick = () => {
      const shouldCollapse = pendingOutsidePointerInteractionRef.current;
      pendingOutsidePointerInteractionRef.current = false;
      if (!shouldCollapse) return;
      setIsExpanded(false);
    };

    document.addEventListener("mousedown", handleDocumentMouseDown, true);
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown, true);
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [
    adaptiveSize,
    content,
    isExpanded,
  ]);

  useEffect(() => {
    if (adaptiveSize && forceExpanded) {
      setIsExpanded(true);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [adaptiveSize, forceExpanded]);

  useEffect(() => {
    if (!adaptiveSize) return;
    if (forceExpandSignal === undefined) return;
    if (lastForceExpandSignalRef.current === forceExpandSignal) return;
    lastForceExpandSignalRef.current = forceExpandSignal;
    setIsExpanded(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [adaptiveSize, forceExpandSignal]);

  useEffect(() => {
    if (!allowComment && taskType !== "task") {
      setTaskType("task");
    }
  }, [allowComment, taskType]);

  useEffect(() => {
    if (!composeRestoreRequest) return;
    if (lastAppliedRestoreRequestIdRef.current === composeRestoreRequest.id) return;
    lastAppliedRestoreRequestIdRef.current = composeRestoreRequest.id;
    const restoreState = composeRestoreRequest.state;
    setContent(restoreState.content || "");
    const requestedMessageType = restoreState.messageType;
    const restoredTaskType = allowComment && restoreState.taskType === "comment" ? "comment" : "task";
    if (!allowComment) {
      setTaskType("task");
    } else if (
      allowFeedMessageTypes &&
      (requestedMessageType === "offer" || requestedMessageType === "request")
    ) {
      setTaskType(requestedMessageType);
    } else {
      setTaskType(restoredTaskType);
    }
    setDueDate(restoreState.dueDate);
    setDueTime(restoreState.dueTime || "");
    setDateType(restoreState.dateType || "due");
    setPriority(typeof restoreState.priority === "number" ? restoreState.priority : undefined);
    setNip99({ ...(restoreState.nip99 || {}) });
    const restoredGeohash = normalizeGeohash(restoreState.locationGeohash);
    setLocationGeohash(restoredGeohash);
    setShowLocationControls(Boolean(restoredGeohash));
    setIsNip99TitleTouched(Boolean(restoreState.nip99?.title?.trim()));
    setIsNip99SummaryTouched(Boolean(restoreState.nip99?.summary?.trim()));
    setAttachments(
      (restoreState.attachments || []).map((attachment, index) => ({
        id: `restore-${composeRestoreRequest.id}-${index}`,
        fileName: attachment.name || attachment.url,
        status: "uploaded",
        source: "url",
        ...attachment,
      }))
    );
    setExplicitTagNames(
      (restoreState.explicitTagNames || [])
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    );
    setExplicitMentionPubkeys(
      (restoreState.explicitMentionPubkeys || [])
        .map((pubkey) => pubkey.trim().toLowerCase())
        .filter((pubkey) => /^[a-f0-9]{64}$/i.test(pubkey))
    );
    if (restoreState.selectedRelays && restoreState.selectedRelays.length > 0) {
      setSelectedRelays(restoreState.selectedRelays);
    }
    if (adaptiveSize) {
      setIsExpanded(true);
    }
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }, [adaptiveSize, allowComment, allowFeedMessageTypes, composeRestoreRequest]);

  useEffect(() => {
    if (!draftStorageKey) return;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          content,
          taskType,
          messageType: taskType,
          dueDate: dueDate ? dueDate.toISOString() : undefined,
          dueTime,
          dateType,
          selectedRelays,
          explicitTagNames,
          explicitMentionPubkeys,
          priority,
          nip99,
          locationGeohash,
          attachments: attachments
            .filter((attachment) => attachment.status === "uploaded" && attachment.url)
            .map((attachment) => ({
              url: attachment.url,
              mimeType: attachment.mimeType,
              sha256: attachment.sha256,
              size: attachment.size,
              dimensions: attachment.dimensions,
              blurhash: attachment.blurhash,
              alt: attachment.alt,
              name: attachment.name || attachment.fileName,
            })),
        } satisfies ComposeDraftState)
      );
    } catch {
      // Ignore persistence errors.
    }
  }, [content, taskType, dueDate, dueTime, dateType, selectedRelays, explicitTagNames, explicitMentionPubkeys, priority, nip99, locationGeohash, attachments, draftStorageKey]);

  useEffect(() => {
    if (!mentionRequest?.mention) return;
    const mention = mentionRequest.mention.startsWith("@")
      ? mentionRequest.mention
      : `@${mentionRequest.mention}`;

    setContent((previousContent) => {
      if (hasMention(previousContent, mention)) {
        return previousContent;
      }
      const separator = previousContent && !previousContent.endsWith(" ") ? " " : "";
      return `${previousContent}${separator}${mention} `;
    });

    if (adaptiveSize) {
      setIsExpanded(true);
    }

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }, [mentionRequest, adaptiveSize]);

  const handleAttachmentUpload = async (file: File, id: string) => {
    try {
      const uploaded = await uploadAttachment(file, {
        getAuthHeader: (url, method) => createHttpAuthHeader(url, method),
      });
      setAttachments((previous) =>
        previous.map((attachment) =>
          attachment.id === id
            ? {
                ...attachment,
                ...uploaded,
                fileName: attachment.fileName || uploaded.name || file.name,
                status: "uploaded",
                source: "upload",
              }
            : attachment
        )
      );
      if (file.type.startsWith("image/") && loadAutoCaptionEnabled()) {
        featureDebugLog("auto-caption", "Starting post-upload caption generation for image attachment", {
          attachmentId: id,
          fileName: file.name,
        });
        void (async () => {
          const result = await generateLocalImageCaption(file);
          if (!result.caption) {
            notifyAutoCaptionFailureOnce(result);
            featureDebugLog("auto-caption", "No caption generated for uploaded image attachment", {
              attachmentId: id,
              fileName: file.name,
              status: result.status,
              reason: result.reason || result.error || null,
            });
            return;
          }
          setAttachments((previous) =>
            previous.map((attachment) =>
              attachment.id === id && !attachment.alt
                ? {
                    ...attachment,
                    alt: result.caption!,
                  }
                : attachment
            )
          );
          featureDebugLog("auto-caption", "Applied generated image caption", {
            attachmentId: id,
            fileName: file.name,
          });
        })();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t("composer.attachments.uploadFailed");
      console.warn("[composer] Attachment upload failed", {
        fileName: file.name,
        size: file.size,
        mimeType: file.type || null,
        error: message,
      });
      setAttachments((previous) =>
        previous.map((attachment) =>
          attachment.id === id
            ? {
                ...attachment,
                status: "failed",
                error: message,
              }
            : attachment
        )
      );
    }
  };

  const queueFiles = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    featureDebugLog("composer-attachments", "Queueing composer attachments", {
      count: selectedFiles.length,
      names: selectedFiles.map((file) => file.name),
      sources: selectedFiles.map((file) => file.type || "unknown"),
    });
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length > 0 && loadAutoCaptionEnabled()) {
      featureDebugLog("auto-caption", "Image attachments queued for local caption inference", {
        imageCount: imageFiles.length,
      });
    }
    const validFiles = selectedFiles.filter((file) => {
      if (file.size <= attachmentMaxFileSizeBytes) return true;
      const maxSizeMb = Math.max(1, Math.ceil(attachmentMaxFileSizeBytes / (1024 * 1024)));
      toast.error(`Attachment "${file.name}" exceeds the ${maxSizeMb} MB limit.`);
      return false;
    });
    if (validFiles.length === 0) return;

    const now = Date.now().toString(36);
    const nextEntries: ComposeAttachment[] = validFiles.map((file, index) => {
      const id = `file-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      attachmentFileRef.current[id] = file;
      return {
        id,
        url: "",
        fileName: file.name,
        mimeType: file.type || undefined,
        size: file.size,
        status: "uploading" as const,
        source: "upload" as const,
      };
    });
    setAttachments((previous) => [...previous, ...nextEntries]);
    for (const entry of nextEntries) {
      const file = attachmentFileRef.current[entry.id];
      if (!file) continue;
      void handleAttachmentUpload(file, entry.id);
    }
  };

  const queueSelectedFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    queueFiles(Array.from(files));
  };

  const insertDroppedText = (text: string) => {
    const normalizedText = text.replace(/\r\n/g, "\n");
    if (!normalizedText) return;
    featureDebugLog("composer-attachments", "Inserting dropped plain text into composer", {
      length: normalizedText.length,
    });
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? content.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const nextContent = content.slice(0, selectionStart) + normalizedText + content.slice(selectionEnd);
    const nextCursor = selectionStart + normalizedText.length;
    setContent(nextContent);
    setCursorPosition(nextCursor);
    requestAnimationFrame(() => {
      const currentTextarea = textareaRef.current;
      if (!currentTextarea) return;
      currentTextarea.focus();
      currentTextarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const retryAttachmentUpload = (attachmentId: string) => {
    const file = attachmentFileRef.current[attachmentId];
    if (!file) return;
    setAttachments((previous) =>
      previous.map((attachment) =>
        attachment.id === attachmentId
          ? {
              ...attachment,
              status: "uploading",
              error: undefined,
            }
          : attachment
      )
    );
    void handleAttachmentUpload(file, attachmentId);
  };

  const removeAttachment = (attachmentId: string) => {
    delete attachmentFileRef.current[attachmentId];
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId));
  };

  // Keep selected publish targets aligned with currently active relay filters.
  useEffect(() => {
    setSelectedRelays(relays.filter(r => r.isActive && isPostableRelay(r)).map(r => r.id));
  }, [relays]);

  useEffect(() => {
    const previous = new Set(prevIncludedChannelsRef.current);
    const next = new Set(includedChannels);
    const added = includedChannels.filter((name) => !previous.has(name));
    const removed = prevIncludedChannelsRef.current.filter((name) => !next.has(name));

    if (added.length === 0 && removed.length === 0) return;

    setExplicitTagNames((current) => {
      const nextTags = [...current];
      for (const tagName of added) {
        if (!nextTags.includes(tagName)) {
          nextTags.push(tagName);
        }
        autoManagedFilterTagNamesRef.current.add(tagName);
      }
      for (const tagName of removed) {
        if (!autoManagedFilterTagNamesRef.current.has(tagName)) continue;
        const index = nextTags.indexOf(tagName);
        if (index >= 0) nextTags.splice(index, 1);
        autoManagedFilterTagNamesRef.current.delete(tagName);
      }
      return nextTags;
    });

    prevIncludedChannelsRef.current = [...includedChannels];
  }, [includedChannels]);

  useEffect(() => {
    const previous = new Set(prevSelectedPeoplePubkeysRef.current);
    const next = new Set(selectedPeoplePubkeys);
    const added = selectedPeoplePubkeys.filter((pubkey) => !previous.has(pubkey));
    const removed = prevSelectedPeoplePubkeysRef.current.filter((pubkey) => !next.has(pubkey));

    if (added.length === 0 && removed.length === 0) return;

    setExplicitMentionPubkeys((current) => {
      const nextMentions = [...current];
      for (const pubkey of added) {
        if (!nextMentions.includes(pubkey)) {
          nextMentions.push(pubkey);
        }
        autoManagedFilterMentionPubkeysRef.current.add(pubkey);
      }
      for (const pubkey of removed) {
        if (!autoManagedFilterMentionPubkeysRef.current.has(pubkey)) continue;
        const index = nextMentions.indexOf(pubkey);
        if (index >= 0) nextMentions.splice(index, 1);
        autoManagedFilterMentionPubkeysRef.current.delete(pubkey);
      }
      return nextMentions;
    });

    prevSelectedPeoplePubkeysRef.current = [...selectedPeoplePubkeys];
  }, [selectedPeoplePubkeys]);

  const resolveSubmitType = (value: unknown): ComposerMessageType => {
    if (
      value === "task" ||
      value === "comment" ||
      (allowFeedMessageTypes && (value === "offer" || value === "request"))
    ) {
      return value;
    }
    return taskType;
  };

  const updateNip99 = (patch: Partial<Nip99Metadata>) => {
    setNip99((previous) => ({ ...previous, ...patch }));
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("toasts.errors.locationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const geohash = encodeGeohash(position.coords.latitude, position.coords.longitude, DEFAULT_GEOHASH_PRECISION);
        setLocationGeohash(geohash);
        toast.success(t("toasts.success.locationCaptured", { geohash }));
      },
      () => {
        toast.error(t("toasts.errors.locationCaptureFailed"));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    if (taskType !== "offer" && taskType !== "request") return;
    const autoFilled = deriveNip99AutofillFromContent(content);
    setNip99((previous) => {
      let changed = false;
      const next = { ...previous };
      if (!isNip99TitleTouched && next.title !== autoFilled.title) {
        next.title = autoFilled.title;
        changed = true;
      }
      if (!isNip99SummaryTouched && next.summary !== autoFilled.summary) {
        next.summary = autoFilled.summary;
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [content, isNip99SummaryTouched, isNip99TitleTouched, taskType]);

  const handleSubmit = async (submitType?: unknown) => {
    if (isPublishing) return;
    if (!content.trim()) return;
    if (!hasMeaningfulComposerText(content)) return;
    const effectiveTaskType = resolveSubmitType(submitType);
    const shouldSubmitTaskDates = effectiveTaskType === "task";
    const submissionDueDate = shouldSubmitTaskDates ? dueDate : undefined;
    const submissionDueTime = shouldSubmitTaskDates ? (dueTime || undefined) : undefined;
    const submissionDateType = shouldSubmitTaskDates ? dateType : undefined;
    
    const extractedTags = extractHashtagsFromContent(content);
    const submitTags = Array.from(new Set([...extractedTags, ...explicitTagNames]));
    if (submitTags.length === 0 && !parentId) {
      notifyNeedTag(t);
      return;
    }
    const listingMetadata =
      effectiveTaskType === "offer" || effectiveTaskType === "request"
        ? {
            ...deriveNip99AutofillFromContent(content),
            identifier: nip99.identifier?.trim() || undefined,
            title: nip99.title?.trim() || undefined,
            summary: nip99.summary?.trim() || undefined,
            location: nip99.location?.trim() || undefined,
            price: nip99.price?.trim() || undefined,
            currency: nip99.currency?.trim() || undefined,
            frequency: nip99.frequency?.trim() || undefined,
            status: nip99.status || "active",
            publishedAt: nip99.publishedAt,
          }
        : undefined;
    const uploadedAttachments: PublishedAttachment[] = attachments
      .filter((attachment) => attachment.status === "uploaded" && attachment.url)
      .map((attachment) => ({
        url: attachment.url,
        mimeType: attachment.mimeType,
        sha256: attachment.sha256,
        size: attachment.size,
        dimensions: attachment.dimensions,
        blurhash: attachment.blurhash,
        alt: attachment.alt,
        name: attachment.name || attachment.fileName,
      }));

    // Also add locally (and publish in parent handler)
    const publishingToastId = "task-composer-publishing";
    setIsPublishing(true);
    toast.loading(t("composer.blocked.publishing"), { id: publishingToastId });
    let result: TaskCreateResult;
    try {
      const normalizedLocationGeohash = normalizeGeohash(locationGeohash);
      result = await Promise.resolve(
        normalizedLocationGeohash
          ? onSubmit(
              content,
              submitTags,
              effectiveSelectedRelayIds,
              effectiveTaskType,
              submissionDueDate,
              submissionDueTime,
              submissionDateType,
              explicitMentionPubkeys,
              priority,
              uploadedAttachments,
              listingMetadata,
              normalizedLocationGeohash
            )
          : onSubmit(
              content,
              submitTags,
              effectiveSelectedRelayIds,
              effectiveTaskType,
              submissionDueDate,
              submissionDueTime,
              submissionDateType,
              explicitMentionPubkeys,
              priority,
              uploadedAttachments,
              listingMetadata
            )
      );
    } catch (error) {
      console.error("Task submit failed", error);
      notifyTaskCreationFailed(t);
      toast.dismiss(publishingToastId);
      setIsPublishing(false);
      return;
    }
    toast.dismiss(publishingToastId);
    setIsPublishing(false);
    if (!result.ok) {
      return;
    }
    setIsSendLaunching(true);
    if (sendLaunchTimeoutRef.current !== null) {
      window.clearTimeout(sendLaunchTimeoutRef.current);
    }
    sendLaunchTimeoutRef.current = window.setTimeout(() => {
      setIsSendLaunching(false);
      sendLaunchTimeoutRef.current = null;
    }, 260);
    setContent("");
    prevIncludedChannelsRef.current = [...includedChannels];
    prevSelectedPeoplePubkeysRef.current = [...selectedPeoplePubkeys];
    autoManagedFilterTagNamesRef.current = new Set(includedChannels);
    autoManagedFilterMentionPubkeysRef.current = new Set(selectedPeoplePubkeys);
    setExplicitTagNames([...includedChannels]);
    setExplicitMentionPubkeys([...selectedPeoplePubkeys]);
    setLocationGeohash(undefined);
    setShowLocationControls(false);
    setNip99({});
    setIsNip99TitleTouched(false);
    setIsNip99SummaryTouched(false);
    setAttachments([]);
    attachmentFileRef.current = {};
    if (adaptiveSize) {
      setIsExpanded(true);
    }
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    if (draftStorageKey) {
      localStorage.removeItem(draftStorageKey);
    }
  };

  const filteredChannels = filterChannelsForAutocomplete(channels, hashtagFilter);
  const filteredPeople = mentionablePeople.filter((person) => {
    return personMatchesMentionQuery(person, mentionFilter);
  }).slice(0, 8);
  const parsedMentions = extractMentionIdentifiersFromContent(content);
  const parsedMentionSet = new Set(parsedMentions.map((identifier) => identifier.trim().toLowerCase()));
  const explicitMentionItems = explicitMentionPubkeys.map((pubkey) => {
    const person = people.find((candidate) => candidate.id.toLowerCase() === pubkey);
    const identifier = person ? getPreferredMentionIdentifier(person) : pubkey;
    return {
      pubkey,
      identifier,
      normalizedIdentifier: identifier.trim().toLowerCase(),
    };
  });
  const mentionChipMap = new Map<string, { identifier: string; metadataOnly: boolean; explicitPubkey?: string }>();
  for (const identifier of parsedMentions) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (!normalizedIdentifier) continue;
    mentionChipMap.set(normalizedIdentifier, {
      identifier,
      metadataOnly: false,
    });
  }
  for (const explicitMention of explicitMentionItems) {
    if (!explicitMention.normalizedIdentifier) continue;
    if (mentionChipMap.has(explicitMention.normalizedIdentifier)) continue;
    mentionChipMap.set(explicitMention.normalizedIdentifier, {
      identifier: explicitMention.identifier,
      metadataOnly: !parsedMentionSet.has(explicitMention.normalizedIdentifier),
      explicitPubkey: explicitMention.pubkey,
    });
  }
  const mentionChipItems = Array.from(mentionChipMap.values()).map((chip) => {
    const normalized = chip.identifier.trim().toLowerCase();
    const matchingPerson = people.find((person) => getMentionAliases(person).includes(normalized));
    const resolvedLabel = (matchingPerson?.name || matchingPerson?.displayName || "").trim();
    const filterBacked = chip.metadataOnly && Boolean(chip.explicitPubkey && selectedPeoplePubkeys.includes(chip.explicitPubkey));
    return {
      ...chip,
      label: resolvedLabel || formatMentionIdentifierForDisplay(chip.identifier),
      filterBacked,
      isRemovable: chip.metadataOnly || filterBacked,
    };
  });
  const parsedHashtags = extractHashtagsFromContent(content);
  const parsedHashtagSet = new Set(parsedHashtags);
  const hashtagChipItems = [
    ...parsedHashtags.map((tag) => ({ tag, metadataOnly: false, filterBacked: false, isRemovable: false })),
    ...explicitTagNames
      .filter((tag) => !parsedHashtagSet.has(tag))
      .map((tag) => {
        const filterBacked = includedChannels.includes(tag);
        return { tag, metadataOnly: true, filterBacked, isRemovable: true };
      }),
  ];
  const hasAtLeastOneTag = countHashtagsInContent(content) + explicitTagNames.length > 0;
  const canInheritParentTags = Boolean(parentId);
  const hasMeaningfulContent = hasMeaningfulComposerText(content);
  const hasPendingAttachmentUploads = attachments.some((attachment) => attachment.status === "uploading");
  const hasFailedAttachmentUploads = attachments.some((attachment) => attachment.status === "failed");
  const fallbackDefaultRelayIds = (() => {
    const activePostableRelayIds = relays
      .filter((relay) => relay.isActive && isPostableRelay(relay))
      .map((relay) => relay.id);
    return activePostableRelayIds.length === 1 ? [activePostableRelayIds[0]] : [];
  })();
  const effectiveSelectedRelayIds = selectedRelays.length > 0 ? selectedRelays : fallbackDefaultRelayIds;
  const selectedRelayObjects = relays.filter((relay) => effectiveSelectedRelayIds.includes(relay.id));
  const hasNoConnectedRelay = !selectedRelayObjects.some(isPostableRelay);
  const hasInvalidRootTaskRelaySelection =
    taskType === "task" && !parentId && (effectiveSelectedRelayIds.length !== 1 || hasNoConnectedRelay);
  const isCommentLikeRootPostType = taskType === "comment" || taskType === "offer" || taskType === "request";
  const hasInvalidRootCommentRelaySelection =
    isCommentLikeRootPostType && !parentId && hasNoConnectedRelay;
  const submitBlock = resolveComposeSubmitBlock({
    isSignedIn: authPolicy.canCreateContent,
    hasMeaningfulContent,
    hasAtLeastOneTag,
    canInheritParentTags,
    hasInvalidRootCommentRelaySelection,
    hasInvalidRootTaskRelaySelection,
    hasPendingAttachmentUploads,
    hasFailedAttachmentUploads,
    t,
  });
  const submitBlockedReason = submitBlock?.reason ?? null;
  const showSubmitBlockBanner = submitBlock?.code !== "write";
  const showSubmitBlockDetail = submitBlock?.code === "relay"
    || submitBlock?.code === "selectTask"
    || submitBlock?.code === "uploading"
    || submitBlock?.code === "uploadFailed";
  const isSubmitButtonEmptyDisabled = authPolicy.canCreateContent && content.trim().length === 0;
  const submitButtonLabel = isSubmitButtonEmptyDisabled ? null : submitBlock?.ctaLabel;

  const pulseTarget = (target: "input" | "attachments" | "blocker") => {
    setHighlightedTarget(target);
    if (remediationHighlightTimeoutRef.current !== null) {
      window.clearTimeout(remediationHighlightTimeoutRef.current);
    }
    remediationHighlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedTarget((current) => (current === target ? null : current));
      remediationHighlightTimeoutRef.current = null;
    }, 1800);
  };

  const focusComposerInput = (options?: { openHashtagSuggestions?: boolean }) => {
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const nextCursor = textarea.selectionStart ?? textarea.value.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
      setCursorPosition(nextCursor);
      updateAutocompleteFromCursor(textarea.value, nextCursor, true);
      if (options?.openHashtagSuggestions) {
        setShowHashtagSuggestions(true);
        setShowMentionSuggestions(false);
        setActiveSuggestionIndex(0);
      }
    }, 0);
    pulseTarget("input");
  };

  const focusAttachments = () => {
    attachmentsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    pulseTarget("attachments");
  };

  const handleBlockedSubmitAttempt = () => {
    if (!submitBlock) return;
    switch (submitBlock.action) {
      case "focus-input":
        focusComposerInput();
        break;
      case "open-channel-selector":
        focusComposerInput({ openHashtagSuggestions: true });
        break;
      case "focus-attachments":
        focusAttachments();
        break;
      case "open-relay-selector":
      case "focus-task-context":
      case "review-blocker":
        blockerPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        pulseTarget("blocker");
        break;
      case null:
        break;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showHashtagSuggestions) {
      if (filteredChannels.length > 0 && e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev + 1) % filteredChannels.length);
        return;
      }
      if (filteredChannels.length > 0 && e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev - 1 + filteredChannels.length) % filteredChannels.length);
        return;
      }
      if (filteredChannels.length > 0 && isAutocompleteAcceptKey(e)) {
        e.preventDefault();
        const selected = filteredChannels[Math.max(activeSuggestionIndex, 0)] || filteredChannels[0];
        if (selected) {
          insertHashtag(selected.name);
        }
        return;
      }
      if (isMetadataOnlyAutocompleteKey(e)) {
        const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
        const textBeforeCursor = content.slice(0, effectiveCursor);
        const typedHashtag = getHashtagQueryAtCursor(textBeforeCursor);
        if (typedHashtag !== null) {
          const selected = filteredChannels[Math.max(activeSuggestionIndex, 0)] || filteredChannels[0];
          const metadataTag = selected?.name || typedHashtag;
          if (metadataTag) {
            e.preventDefault();
            addHashtagTagOnly(metadataTag);
            return;
          }
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowHashtagSuggestions(false);
        setActiveSuggestionIndex(0);
        return;
      }
    }
    if (showMentionSuggestions && filteredPeople.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev + 1) % filteredPeople.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev - 1 + filteredPeople.length) % filteredPeople.length);
        return;
      }
      if (isAutocompleteAcceptKey(e)) {
        e.preventDefault();
        const selected = filteredPeople[Math.max(activeSuggestionIndex, 0)] || filteredPeople[0];
        if (selected) {
          insertMention(getPreferredMentionIdentifier(selected));
        }
        return;
      }
      if (isMetadataOnlyAutocompleteKey(e)) {
        const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
        const textBeforeCursor = content.slice(0, effectiveCursor);
        if (hasMentionQueryAtCursor(textBeforeCursor) || /@[^\s@]*$/.test(content)) {
          e.preventDefault();
          const selected = filteredPeople[Math.max(activeSuggestionIndex, 0)] || filteredPeople[0];
          if (selected) {
            addMentionTagOnly(selected);
          }
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionSuggestions(false);
        setActiveSuggestionIndex(0);
        return;
      }
    }

    if (isAlternateSubmitKey(e) && !showHashtagSuggestions && !showMentionSuggestions) {
      e.preventDefault();
      const alternateType: ComposerMessageType = allowComment
        ? taskType === "task"
          ? "comment"
          : "task"
        : "task";
      handleSubmit(alternateType);
      return;
    }
    if (isPrimarySubmitKey(e)) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === "Escape") {
      if (adaptiveSize) {
        setIsExpanded(false);
      }
      onCancel();
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    setContent(newContent);
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    setCursorPosition(cursorPos);

    const textBeforeCursor = newContent.slice(0, cursorPos);
    const autocompleteMatch = getComposerAutocompleteMatch(textBeforeCursor);
    if (autocompleteMatch?.kind === "hashtag") {
      setHashtagFilter(autocompleteMatch.query);
      setShowHashtagSuggestions(true);
      setShowMentionSuggestions(false);
      setActiveSuggestionIndex(0);
      return;
    }
    if (autocompleteMatch?.kind === "mention") {
      setMentionFilter(autocompleteMatch.query);
      setShowMentionSuggestions(true);
      setShowHashtagSuggestions(false);
      setActiveSuggestionIndex(0);
      return;
    }
    setShowHashtagSuggestions(false);
    setShowMentionSuggestions(false);
    setActiveSuggestionIndex(0);
  };

  const updateAutocompleteFromCursor = (textValue: string, nextCursorPosition: number, focused: boolean) => {
    if (!focused) {
      setShowHashtagSuggestions(false);
      setShowMentionSuggestions(false);
      setActiveSuggestionIndex(0);
      return;
    }
    const textBeforeCursor = textValue.slice(0, nextCursorPosition);
    const autocompleteMatch = getComposerAutocompleteMatch(textBeforeCursor);
    if (autocompleteMatch?.kind === "hashtag") {
      setHashtagFilter(autocompleteMatch.query);
      setShowHashtagSuggestions(true);
      setShowMentionSuggestions(false);
      setActiveSuggestionIndex(0);
      return;
    }
    if (autocompleteMatch?.kind === "mention") {
      setMentionFilter(autocompleteMatch.query);
      setShowMentionSuggestions(true);
      setShowHashtagSuggestions(false);
      setActiveSuggestionIndex(0);
      return;
    }
    setShowHashtagSuggestions(false);
    setShowMentionSuggestions(false);
    setActiveSuggestionIndex(0);
  };

  const insertHashtag = (tagName: string) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const hashtagStart = textBeforeCursor.lastIndexOf("#");
    const newContent = textBeforeCursor.slice(0, hashtagStart) + `#${tagName} ` + textAfterCursor;
    setContent(newContent);
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    setShowHashtagSuggestions(false);
    setShowMentionSuggestions(false);
    setActiveSuggestionIndex(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const insertMention = (mentionToken: string) => {
    const textBeforeCursor = content.slice(0, cursorPosition);
    const textAfterCursor = content.slice(cursorPosition);
    const mentionStart = textBeforeCursor.lastIndexOf("@");
    if (mentionStart < 0) return;
    const newContent = textBeforeCursor.slice(0, mentionStart) + `@${mentionToken} ` + textAfterCursor;
    setContent(newContent);
    if (adaptiveSize && !isExpanded) {
      setIsExpanded(true);
    }
    setShowMentionSuggestions(false);
    setShowHashtagSuggestions(false);
    setActiveSuggestionIndex(0);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const addHashtagTagOnly = (tagName: string) => {
    const normalizedTag = tagName.trim().toLowerCase();
    if (!normalizedTag) return;

    setExplicitTagNames((previous) =>
      previous.includes(normalizedTag) ? previous : [...previous, normalizedTag]
    );

    const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
    const textBeforeCursor = content.slice(0, effectiveCursor);
    const hashtagStartFromCursor = textBeforeCursor.lastIndexOf("#");
    const hashtagStart = hashtagStartFromCursor >= 0 ? hashtagStartFromCursor : content.lastIndexOf("#");
    if (hashtagStart < 0) {
      return;
    }

    let hashtagEnd = hashtagStart + 1;
    while (hashtagEnd < content.length && !/\s/.test(content[hashtagEnd])) {
      hashtagEnd += 1;
    }

    const nextContent = (content.slice(0, hashtagStart) + content.slice(hashtagEnd))
      .replace(/[ \t]{2,}/g, " ");
    setContent(nextContent);
    setCursorPosition(hashtagStart);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(hashtagStart, hashtagStart);
    }, 0);

    setShowHashtagSuggestions(false);
    setShowMentionSuggestions(false);
    setHashtagFilter("");
    setActiveSuggestionIndex(0);
  };

  const addMentionTagOnly = (person: Person) => {
    const normalizedPubkey = person.id.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/i.test(normalizedPubkey)) {
      return;
    }

    const effectiveCursor = textareaRef.current?.selectionStart ?? cursorPosition;
    const textBeforeCursor = content.slice(0, effectiveCursor);
    const mentionStartFromCursor = textBeforeCursor.lastIndexOf("@");
    const mentionStart = mentionStartFromCursor >= 0 ? mentionStartFromCursor : content.lastIndexOf("@");
    if (mentionStart < 0) {
      return;
    }

    setExplicitMentionPubkeys((previous) =>
      previous.includes(normalizedPubkey) ? previous : [...previous, normalizedPubkey]
    );

    let mentionEnd = mentionStart + 1;
    while (mentionEnd < content.length && !/\s/.test(content[mentionEnd])) {
      mentionEnd += 1;
    }

    const nextContent = (content.slice(0, mentionStart) + content.slice(mentionEnd))
      .replace(/[ \t]{2,}/g, " ");
    setContent(nextContent);
    setCursorPosition(mentionStart);
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(mentionStart, mentionStart);
    }, 0);

    setShowMentionSuggestions(false);
    setShowHashtagSuggestions(false);
    setMentionFilter("");
    setActiveSuggestionIndex(0);
  };

  const removeExplicitHashtag = (tagName: string) => {
    const normalizedTag = tagName.trim().toLowerCase();
    if (!normalizedTag) return;
    const channel = channels.find((entry) => entry.name.trim().toLowerCase() === normalizedTag);
    if (channel?.filterState === "included") {
      autoManagedFilterTagNamesRef.current.delete(normalizedTag);
      void dispatchFeedInteraction({ type: "filter.clearChannel", channelId: channel.id });
    }
    setExplicitTagNames((previous) => previous.filter((tag) => tag !== normalizedTag));
  };

  const removeExplicitMention = (pubkey: string | undefined) => {
    if (!pubkey) return;
    const normalizedPubkey = pubkey.trim().toLowerCase();
    const person = people.find((entry) => entry.id.trim().toLowerCase() === normalizedPubkey);
    if (person?.isSelected) {
      autoManagedFilterMentionPubkeysRef.current.delete(normalizedPubkey);
      void dispatchFeedInteraction({ type: "filter.clearPerson", personId: person.id });
    }
    setExplicitMentionPubkeys((previous) => previous.filter((value) => value !== normalizedPubkey));
  };

  const hasPersistentChipTray = mentionChipItems.length > 0 || hashtagChipItems.length > 0;
  const showExpandedControls =
    !adaptiveSize || isExpanded || content.trim().length > 0;

  useEffect(() => {
    if (showExpandedControls) return;
    setShowMentionSuggestions(false);
    setShowHashtagSuggestions(false);
    setActiveSuggestionIndex(0);
  }, [showExpandedControls]);

  return (
    <div
      ref={composerRef}
      onDragEnter={(event) => {
        if (!hasFilesInDataTransfer(event.dataTransfer)) return;
        dragDepthRef.current += 1;
        setIsDraggingFilesOverComposer(true);
      }}
      onDragOver={(event) => {
        if (!hasFilesInDataTransfer(event.dataTransfer)) return;
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
        if (!isDraggingFilesOverComposer) {
          setIsDraggingFilesOverComposer(true);
        }
      }}
      onDragLeave={(event) => {
        if (!hasFilesInDataTransfer(event.dataTransfer)) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0 || event.currentTarget === event.target) {
          setIsDraggingFilesOverComposer(false);
        }
      }}
      onDrop={(event) => {
        const droppedFiles = extractFilesFromDataTransfer(event.dataTransfer);
        dragDepthRef.current = 0;
        setIsDraggingFilesOverComposer(false);
        if (droppedFiles.length > 0) {
          event.preventDefault();
          featureDebugLog("composer-attachments", "Accepted dropped files", {
            count: droppedFiles.length,
          });
          queueFiles(droppedFiles);
          if (adaptiveSize && !isExpanded) {
            setIsExpanded(true);
          }
          requestAnimationFrame(() => {
            textareaRef.current?.focus();
          });
          return;
        }
        const droppedText = extractPlainTextFromDataTransfer(event.dataTransfer);
        if (!droppedText) return;
        event.preventDefault();
        insertDroppedText(droppedText);
      }}
      onMouseDownCapture={(event) => {
        internalMouseDownWithinComposerRef.current = event.target !== textareaRef.current;
      }}
      className={cn(
        "flex flex-col gap-3",
        compact && "gap-2",
        adaptiveSize && !showExpandedControls && "gap-1",
        isDraggingFilesOverComposer && "rounded-2xl ring-2 ring-dashed ring-primary/60 ring-offset-2 ring-offset-background"
      )}
      data-onboarding="focused-compose"
    >
      <div className="relative order-1">
        <textarea
          data-onboarding="compose-input"
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onPaste={(event) => {
            const pastedFiles = extractFilesFromDataTransfer(event.clipboardData);
            if (pastedFiles.length === 0) return;
            event.preventDefault();
            featureDebugLog("composer-attachments", "Accepted pasted files", {
              count: pastedFiles.length,
            });
            queueFiles(pastedFiles);
          }}
          onKeyDown={handleKeyDown}
          onSelect={(event) => {
            const target = event.currentTarget;
            const nextCursor = target.selectionStart ?? 0;
            setCursorPosition(nextCursor);
            updateAutocompleteFromCursor(target.value, nextCursor, isComposerFocused);
          }}
          onFocus={() => {
            setIsComposerFocused(true);
            if (adaptiveSize && !isExpanded) {
              setIsExpanded(true);
            }
            const textarea = textareaRef.current;
            if (!textarea) return;
            const nextCursor = textarea.selectionStart ?? 0;
            setCursorPosition(nextCursor);
            updateAutocompleteFromCursor(textarea.value, nextCursor, true);
          }}
          onBlur={(event) => {
            setIsComposerFocused(false);
            updateAutocompleteFromCursor(content, cursorPosition, false);
            if (!adaptiveSize || content.trim()) return;
            const hadInternalMouseDown = internalMouseDownWithinComposerRef.current;
            internalMouseDownWithinComposerRef.current = false;
            const nextFocusedElement = event.relatedTarget;
            if (!nextFocusedElement || hadInternalMouseDown) return;
            if (composerRef.current?.contains(nextFocusedElement)) return;
            if (dueDatePopoverContentRef.current?.contains(nextFocusedElement)) return;
            if (pendingOutsidePointerInteractionRef.current) return;
            setIsExpanded(false);
          }}
          aria-label={
            taskType === "task"
              ? t("composer.placeholders.task")
              : taskType === "offer"
                ? t("composer.placeholders.offer")
                : taskType === "request"
                  ? t("composer.placeholders.request")
                  : t("composer.placeholders.comment")
          }
          placeholder={
            taskType === "task"
              ? t("composer.placeholders.task")
              : taskType === "offer"
                ? t("composer.placeholders.offer")
                : taskType === "request"
                  ? t("composer.placeholders.request")
                  : t("composer.placeholders.comment")
          }
          className={cn(
            "w-full bg-muted/60 border border-border/50 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30 shadow-sm",
            highlightedTarget === "input" && "ring-2 ring-amber-400 border-amber-400/70",
            adaptiveSize && !showExpandedControls
              ? "min-h-[42px] py-2"
              : compact
                ? "min-h-[60px]"
                : "min-h-[80px]"
          )}
          rows={adaptiveSize && !showExpandedControls ? 1 : compact ? 2 : 3}
        />

        {/* Channel suggestions */}
        {showHashtagSuggestions && filteredChannels.length > 0 && (
          <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-[115] w-56 py-1 max-h-72 overflow-y-auto overscroll-contain">
            {filteredChannels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  if (isMetadataOnlyAutocompleteClick(e)) {
                    addHashtagTagOnly(channel.name);
                    return;
                  }
                  insertHashtag(channel.name);
                }}
                onMouseEnter={() => {
                  const index = filteredChannels.findIndex((c) => c.id === channel.id);
                  setActiveSuggestionIndex(index >= 0 ? index : 0);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left",
                  filteredChannels[activeSuggestionIndex]?.id === channel.id ? "bg-muted motion-magnet-active" : "hover:bg-muted"
                )}
              >
                <Hash className="w-4 h-4 text-primary" />
                <span className="text-sm truncate">{channel.name}</span>
              </button>
            ))}
          </div>
        )}
        {showMentionSuggestions && filteredPeople.length > 0 && (
          <div className="absolute left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-[115] w-[22rem] max-w-[calc(100vw-2rem)] py-1 max-h-72 overflow-y-auto overscroll-contain">
            {filteredPeople.map((person) => {
                  const mentionIdentifier = getPreferredMentionIdentifier(person);
                  const mentionDisplay = formatMentionIdentifierForDisplay(mentionIdentifier);
                  const isActive = filteredPeople[activeSuggestionIndex]?.id === person.id;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.preventDefault();
                        if (isMetadataOnlyAutocompleteClick(e)) {
                          addMentionTagOnly(person);
                          return;
                        }
                        insertMention(mentionIdentifier);
                      }}
                  onMouseEnter={() => {
                    const index = filteredPeople.findIndex((p) => p.id === person.id);
                    setActiveSuggestionIndex(index >= 0 ? index : 0);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left",
                    isActive ? "bg-muted motion-magnet-active" : "hover:bg-muted"
                  )}
                  >
                  <UserAvatar
                    id={person.id}
                    displayName={person.displayName || person.name}
                    avatarUrl={person.avatar}
                    className="w-4 h-4"
                  />
                  <span className="text-sm min-w-0 flex-1 truncate">@{person.name || person.displayName}</span>
                  <span
                    className="text-xs text-muted-foreground max-w-[11rem] truncate"
                    title={`@${mentionIdentifier}`}
                  >
                    (@{mentionDisplay})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showExpandedControls && attachments.length > 0 && (
        <div
          ref={attachmentsRef}
          className={cn(
            "order-2 space-y-2 rounded-xl",
            highlightedTarget === "attachments" && "ring-2 ring-amber-400/80 ring-offset-2 ring-offset-background"
          )}
        >
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{attachment.fileName || attachment.name || attachment.url}</span>
                <div className="flex items-center gap-1">
                  {attachment.status === "uploading" && (
                    <span className="text-muted-foreground">{t("composer.attachments.uploading")}</span>
                  )}
                  {attachment.status === "failed" && (
                    <>
                      <button
                        type="button"
                        onClick={() => retryAttachmentUpload(attachment.id)}
                        className="rounded px-1.5 py-0.5 text-foreground hover:bg-muted"
                      >
                        {t("composer.attachments.retry")}
                      </button>
                      <span className="text-destructive">{t("composer.attachments.failed")}</span>
                    </>
                  )}
                  {attachment.status === "uploaded" && (
                    <span className="text-emerald-600">{t("composer.attachments.ready")}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="rounded p-0.5 hover:bg-muted"
                    aria-label={t("composer.attachments.remove")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {attachment.status === "failed" && attachment.error && (
                <p className="mt-1 text-[11px] text-destructive">{attachment.error}</p>
              )}
              {attachment.status === "uploaded" && attachment.mimeType?.startsWith("image/") && (
                <input
                  type="text"
                  value={attachment.alt || ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAttachments((previous) =>
                      previous.map((item) =>
                        item.id === attachment.id
                          ? {
                              ...item,
                              alt: value,
                            }
                          : item
                      )
                    );
                  }}
                  className="mt-1 h-7 w-full rounded border border-border/50 bg-background px-2 text-xs"
                  placeholder={t("composer.attachments.altPlaceholder")}
                  aria-label={t("composer.attachments.altLabel")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {(hasPersistentChipTray || (showExpandedControls && Boolean(submitBlockedReason && authPolicy.canCreateContent))) && (
        <div
          className={cn(
            "order-7 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2",
            adaptiveSize && "motion-ink-stagger [--stagger-index:0]"
          )}
        >
          {mentionChipItems.map((mention) => (
            <button
              key={`mention-${mention.identifier}`}
              type="button"
              data-chip-kind="mention"
              data-chip-value={mention.explicitPubkey ?? mention.identifier}
              onClick={() => {
                if (mention.isRemovable) {
                  removeExplicitMention(mention.explicitPubkey);
                  return;
                }
                focusComposerInput();
              }}
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                mention.filterBacked
                  ? "cursor-pointer bg-primary/15 text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                  : mention.metadataOnly
                    ? "cursor-pointer bg-primary/10 text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                    : "cursor-text bg-primary/10 text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
              )}
              title={`${t("composer.labels.mentions")}: @${mention.identifier}`}
            >
              {mention.isRemovable ? (
                <>
                  <AtSign className="w-3 h-3 group-hover:hidden group-focus-visible:hidden" />
                  <X className="hidden w-3 h-3 group-hover:block group-focus-visible:block" />
                </>
              ) : (
                <AtSign className="w-3 h-3" />
              )}
              {mention.label}
            </button>
          ))}
          {hashtagChipItems.map((tagChip) => (
            <button
              key={`hashtag-${tagChip.tag}`}
              type="button"
              data-chip-kind="hashtag"
              data-chip-value={tagChip.tag}
              onClick={() => {
                if (tagChip.isRemovable) {
                  removeExplicitHashtag(tagChip.tag);
                  return;
                }
                focusComposerInput();
              }}
              className={cn(
                "group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
                tagChip.filterBacked
                  ? "cursor-pointer bg-foreground/10 text-foreground hover:bg-foreground/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
                  : tagChip.metadataOnly
                    ? "cursor-pointer bg-muted text-muted-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
                    : "cursor-text bg-muted text-muted-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
              )}
            >
              {tagChip.isRemovable ? (
                <>
                  <Hash className="w-3 h-3 group-hover:hidden group-focus-visible:hidden" />
                  <X className="hidden w-3 h-3 group-hover:block group-focus-visible:block" />
                </>
              ) : (
                <Hash className="w-3 h-3" />
              )}
              {tagChip.tag}
            </button>
          ))}
        </div>
      )}

      {showExpandedControls && submitBlock && authPolicy.canCreateContent && submitBlock.code !== "signin" && showSubmitBlockBanner && (
        <div
          ref={blockerPanelRef}
          role="alert"
          className={cn(
            "order-8 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm",
            highlightedTarget === "blocker" && "ring-2 ring-amber-400"
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800/90">
              {t("composer.blockedDetail.title")}
            </div>
            <div className="font-medium text-foreground">{submitBlock.reason}</div>
            {showSubmitBlockDetail && (
              <div className="text-xs text-muted-foreground">{submitBlock.detail}</div>
            )}
          </div>
        </div>
      )}

      {showExpandedControls && (showLocationControls || Boolean(locationGeohash)) && (
        <div className={cn("order-5 flex flex-wrap items-center gap-2", adaptiveSize && "motion-ink-stagger [--stagger-index:1]")}>
          <button
            type="button"
            onClick={useCurrentLocation}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/50 bg-background px-2 text-xs hover:bg-muted/60"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {t("composer.actions.useCurrentLocation")}
          </button>
          <div className="inline-flex min-w-[14rem] items-center gap-1.5 rounded-md border border-border/50 bg-background px-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={locationGeohash || ""}
              onChange={(event) => setLocationGeohash(normalizeGeohash(event.target.value) || event.target.value.trim().toLowerCase())}
              placeholder={t("composer.placeholders.geohash")}
              aria-label={t("composer.placeholders.geohash")}
              className="h-8 w-full bg-transparent text-xs focus:outline-none"
            />
            {locationGeohash && (
              <button
                type="button"
                onClick={() => setLocationGeohash(undefined)}
                className="rounded p-0.5 hover:bg-muted"
                aria-label={t("composer.actions.clearLocation")}
                title={t("composer.actions.clearLocation")}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Due date for tasks */}
      {showExpandedControls && taskType === "task" && (
        <div className={cn("order-6 flex flex-wrap items-center gap-2", adaptiveSize && "motion-ink-stagger [--stagger-index:2]")}>
          <div className="inline-flex min-w-[5.5rem] items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
            <Flag className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label={t("composer.labels.priority")}
              value={priority === undefined ? "" : String(priority)}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) {
                  setPriority(undefined);
                  return;
                }
                const parsed = Number.parseInt(value, 10);
                setPriority(Number.isFinite(parsed) ? parsed : undefined);
              }}
              className="h-8 w-full cursor-pointer rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none"
            >
              <option value="">{t("composer.labels.priority")}</option>
              <option value="20">P20</option>
              <option value="40">P40</option>
              <option value="60">P60</option>
              <option value="80">P80</option>
              <option value="100">P100</option>
            </select>
          </div>

          <div className="inline-flex min-w-[20rem] items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <select
              aria-label={t("composer.labels.dateType")}
              value={dateType}
              onChange={(event) => setDateType(event.target.value as TaskDateType)}
              className="h-8 w-24 cursor-pointer rounded-md border-none bg-transparent px-2 text-xs text-foreground shadow-none focus:outline-none"
            >
              <option value="due">{t("composer.dates.due")}</option>
              <option value="scheduled">{t("composer.dates.scheduled")}</option>
              <option value="start">{t("composer.dates.start")}</option>
              <option value="end">{t("composer.dates.end")}</option>
              <option value="milestone">{t("composer.dates.milestone")}</option>
            </select>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "h-8 min-w-[6.5rem] rounded-md border border-border/50 px-2 text-left text-sm transition-colors hover:bg-muted/50 hover:text-foreground",
                    dueDate ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {dueDate
                    ? format(dueDate, "MMM d, yyyy")
                    : t("composer.dates.setOptional", {
                        dateType: t(`composer.dates.${dateType}`),
                      })}
                </button>
              </PopoverTrigger>
              <PopoverContent ref={dueDatePopoverContentRef} className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {dueDate && (
              <>
                <Clock className="h-4 w-4 text-muted-foreground" />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="h-8 w-16 rounded-md border border-border/50 bg-transparent px-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  aria-label={t("composer.hints.clearDueDate")}
                  title={t("composer.hints.clearDueDate")}
                  onClick={() => {
                    setDueDate(undefined);
                    setDueTime("");
                  }}
                  className="rounded-md p-1.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>

        </div>
      )}

      {showExpandedControls && (taskType === "offer" || taskType === "request") && (
        <div className={cn("order-6 flex flex-wrap items-end gap-2", adaptiveSize && "motion-ink-stagger [--stagger-index:2]")}>
          <input
            value={nip99.title || ""}
            onChange={(event) => {
              setIsNip99TitleTouched(true);
              updateNip99({ title: event.target.value });
            }}
            placeholder={t("composer.nip99.title")}
            aria-label={t("composer.nip99.title")}
            className="h-8 min-w-[12rem] flex-1 rounded-md border border-border/50 bg-background px-2 text-xs"
          />
          <input
            value={nip99.location || ""}
            onChange={(event) => updateNip99({ location: event.target.value })}
            placeholder={t("composer.nip99.location")}
            aria-label={t("composer.nip99.location")}
            className="h-8 min-w-[8rem] rounded-md border border-border/50 bg-background px-2 text-xs"
          />
          <input
            value={nip99.price || ""}
            onChange={(event) => updateNip99({ price: event.target.value })}
            placeholder={t("composer.nip99.price")}
            aria-label={t("composer.nip99.price")}
            className="h-8 w-20 rounded-md border border-border/50 bg-background px-2 text-xs"
          />
          <input
            value={nip99.currency || "EUR"}
            onChange={(event) => updateNip99({ currency: event.target.value.toUpperCase() })}
            placeholder={t("composer.nip99.currency")}
            aria-label={t("composer.nip99.currency")}
            list="nip99-currency-suggestions"
            className="h-8 w-20 rounded-md border border-border/50 bg-background px-2 text-xs"
            maxLength={8}
          />
          <datalist id="nip99-currency-suggestions">
            {COMMON_NIP99_CURRENCY_CODES.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
          <select
            value={nip99.frequency || ""}
            onChange={(event) => updateNip99({ frequency: event.target.value || undefined })}
            aria-label={t("composer.nip99.frequency")}
            className="h-8 min-w-[6.5rem] rounded-md border border-border/50 bg-background px-2 text-xs"
          >
            <option value="">{t("composer.nip99.frequencyOptions.oneTime")}</option>
            <option value="hour">{t("composer.nip99.frequencyOptions.hour")}</option>
            <option value="day">{t("composer.nip99.frequencyOptions.day")}</option>
            <option value="week">{t("composer.nip99.frequencyOptions.week")}</option>
            <option value="month">{t("composer.nip99.frequencyOptions.month")}</option>
            <option value="year">{t("composer.nip99.frequencyOptions.year")}</option>
          </select>
          <select
            value={nip99.status || "active"}
            onChange={(event) => updateNip99({ status: event.target.value as Nip99Metadata["status"] })}
            aria-label={t("composer.nip99.status")}
            className="h-8 min-w-[6rem] rounded-md border border-border/50 bg-background px-2 text-xs"
          >
            <option value="active">{t("composer.nip99.statusOptions.active")}</option>
            <option value="sold">{t("composer.nip99.statusOptions.sold")}</option>
          </select>
          <input
            value={nip99.summary || ""}
            onChange={(event) => {
              setIsNip99SummaryTouched(true);
              updateNip99({ summary: event.target.value });
            }}
            placeholder={t("composer.nip99.summary")}
            aria-label={t("composer.nip99.summary")}
            className="h-8 min-w-[12rem] flex-[2] rounded-md border border-border/50 bg-background px-2 text-xs"
          />
        </div>
      )}

      {/* Actions */}
      {showExpandedControls && (
      <div className={cn("order-4 flex flex-wrap items-center justify-between gap-2", adaptiveSize && "motion-ink-reveal motion-ink-stagger [--stagger-index:4]")}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const cursorPos = textareaRef.current?.selectionStart || content.length;
              const newContent = content.slice(0, cursorPos) + "#" + content.slice(cursorPos);
              setContent(newContent);
              setCursorPosition(cursorPos + 1);
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.focus();
                  textareaRef.current.setSelectionRange(cursorPos + 1, cursorPos + 1);
                  setShowHashtagSuggestions(true);
                }
              }, 10);
            }}
            className="p-2 rounded-xl hover:bg-muted/70 transition-colors"
            aria-label={t("composer.hints.insertHashtag")}
            title={t("composer.hints.insertHashtagOpen")}
          >
            <Hash className="w-4 h-4 text-primary" />
          </button>
          <button
            onClick={() => {
              const cursorPos = textareaRef.current?.selectionStart || content.length;
              const newContent = content.slice(0, cursorPos) + "@" + content.slice(cursorPos);
              setContent(newContent);
              setCursorPosition(cursorPos + 1);
              setTimeout(() => {
                if (textareaRef.current) {
                  textareaRef.current.focus();
                  textareaRef.current.setSelectionRange(cursorPos + 1, cursorPos + 1);
                  setShowMentionSuggestions(true);
                  setShowHashtagSuggestions(false);
                  setMentionFilter("");
                  setActiveSuggestionIndex(0);
                }
              }, 10);
            }}
            className="p-2 rounded-xl hover:bg-muted/70 transition-colors"
            aria-label={t("composer.hints.insertMention")}
            title={t("composer.hints.insertMentionOpen")}
          >
            <AtSign className="w-4 h-4 text-primary" />
          </button>
          <button
            type="button"
            onClick={() => setShowLocationControls((previous) => !previous)}
            className={cn(
              "p-2 rounded-xl transition-colors",
              showLocationControls || Boolean(locationGeohash)
                ? "bg-primary/20 text-primary"
                : "hover:bg-muted/70"
            )}
            aria-label={t("composer.actions.location")}
            title={t("composer.actions.location")}
          >
            <MapPin className="w-4 h-4 text-primary" />
          </button>
          {uploadEnabled && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-xl hover:bg-muted/70 transition-colors"
                aria-label={t("composer.attachments.add")}
                title={t("composer.attachments.add")}
              >
                <Paperclip className="w-4 h-4 text-primary" />
              </button>
              <span className="hidden text-xs text-muted-foreground xl:inline">
                {isDraggingFilesOverComposer
                  ? t("composer.attachments.dropFiles")
                  : t("composer.attachments.dropOrPasteHint")}
              </span>
            </>
          )}
        </div>

        <div className="ml-auto flex min-w-0 flex-col gap-1 sm:items-end">
          <div className="inline-flex self-end rounded-xl overflow-hidden border border-border/40 shadow-sm">
            {allowComment && (
              <div
                data-onboarding="compose-kind"
                className="inline-flex items-center gap-1 bg-muted/40 border-r border-border/50 p-1"
              >
                <select
                  aria-label={t("composer.labels.kind")}
                  value={taskType}
                  onChange={(event) => setTaskType(event.target.value as ComposerMessageType)}
                  className="sr-only"
                >
                  <option value="task">{t("composer.labels.task")}</option>
                  <option value="comment">{t("composer.labels.comment")}</option>
                  {allowFeedMessageTypes && <option value="offer">{t("composer.labels.offer")}</option>}
                  {allowFeedMessageTypes && <option value="request">{t("composer.labels.request")}</option>}
                </select>
                <button
                  type="button"
                  onClick={() => setTaskType("task")}
                  aria-label={t("composer.labels.task")}
                  className={cn(
                    "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                    taskType === "task"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>{t("composer.labels.task")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskType("comment")}
                  aria-label={t("composer.labels.comment")}
                  className={cn(
                    "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                    taskType === "comment"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t("composer.labels.comment")}</span>
                </button>
                {allowFeedMessageTypes && (
                  <button
                    type="button"
                    onClick={() => setTaskType("offer")}
                    aria-label={t("composer.labels.offer")}
                    className={cn(
                      "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                      taskType === "offer"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>{t("composer.labels.offer")}</span>
                  </button>
                )}
                {allowFeedMessageTypes && (
                  <button
                    type="button"
                    onClick={() => setTaskType("request")}
                    aria-label={t("composer.labels.request")}
                    className={cn(
                      "h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors",
                      taskType === "request"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <HandHelping className="w-3.5 h-3.5" />
                    <span>{t("composer.labels.request")}</span>
                  </button>
                )}
              </div>
            )}
            {(() => {
              const submitActionLabel =
                taskType === "task"
                  ? t("composer.actions.createTask")
                  : taskType === "offer"
                    ? t("composer.actions.postOffer")
                    : taskType === "request"
                      ? t("composer.actions.postRequest")
                      : t("composer.actions.addComment");
              const submitActionIcon =
                taskType === "task"
                  ? <CheckSquare className="w-4 h-4" />
                  : taskType === "offer"
                    ? <Package className="w-4 h-4" />
                    : taskType === "request"
                      ? <HandHelping className="w-4 h-4" />
                      : <MessageSquare className="w-4 h-4" />;
              const submitButtonTitle = submitBlock?.reason || submitActionLabel;
              if (!authPolicy.canCreateContent) {
                return (
                  <button
                    type="button"
                    onClick={() => {
                      void handleSubmit();
                    }}
                    className="min-w-[12.5rem] px-4 py-2 bg-primary text-primary-foreground text-sm hover:bg-primary/90 flex items-center justify-center gap-2"
                    aria-label={t("composer.actions.signin")}
                    title={t("composer.blocked.signin")}
                  >
                    <LogIn className="w-4 h-4" />
                    {t("composer.actions.signin")}
                  </button>
                );
              }
              return (
            <button
              onClick={() => {
                if (submitBlock && !submitBlock.isHardDisabled) {
                  handleBlockedSubmitAttempt();
                  return;
                }
                void handleSubmit();
              }}
              disabled={Boolean(submitBlock?.isHardDisabled) || isSubmitButtonEmptyDisabled || isPublishing}
              aria-label={submitActionLabel}
              title={submitButtonTitle}
              className={cn(
                "min-w-[12.5rem] px-4 py-2 text-sm disabled:cursor-not-allowed flex items-center justify-center gap-2",
                isSubmitButtonEmptyDisabled
                  ? "border border-primary/40 bg-primary/45 text-primary-foreground/85 disabled:opacity-100"
                  : submitBlock && !submitBlock.isHardDisabled
                    ? "border border-primary/25 bg-primary/25 text-primary/75 disabled:opacity-100 hover:bg-primary/30"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-100",
                isSendLaunching && "motion-send-launch"
              )}
            >
              {isPublishing && (
                <span className="w-3 h-3 border border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              )}
              {submitActionIcon}
              {submitButtonLabel || submitActionLabel}
            </button>
              );
            })()}
          </div>
        </div>
      </div>
      )}
      {uploadEnabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              queueSelectedFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}
