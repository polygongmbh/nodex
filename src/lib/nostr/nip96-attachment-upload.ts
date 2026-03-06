import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { PublishedAttachment } from "@/types";
import { parseImetaTag } from "@/lib/attachments";

interface NIP96UploadResponse {
  status?: string;
  message?: string;
  url?: string;
  download_url?: string;
  media_url?: string;
  file_url?: string;
  processing_url?: string;
  data?: unknown;
  nip94_event?: {
    tags?: string[][];
  } | string;
  nip94event?: {
    tags?: string[][];
  } | string;
}

const DEFAULT_UPLOAD_URL = import.meta.env.VITE_NIP96_UPLOAD_URL as string | undefined;
const DEBUG_ATTACHMENTS = String(import.meta.env.VITE_DEBUG_ATTACHMENTS || "").toLowerCase() === "true";
const DEFAULT_MAX_ATTACHMENT_SIZE_BYTES = 100 * 1024 * 1024;

export interface UploadAttachmentOptions {
  uploadUrl?: string;
  getAuthHeader?: (url: string, method: "POST") => Promise<string | null> | string | null;
}

export function getAttachmentMaxFileSizeBytes(): number {
  const raw = Number(import.meta.env.VITE_NIP96_MAX_UPLOAD_BYTES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_MAX_ATTACHMENT_SIZE_BYTES;
}

export function isAttachmentUploadConfigured(uploadUrl: string = DEFAULT_UPLOAD_URL || ""): boolean {
  return uploadUrl.trim().length > 0;
}

function shouldDebugAttachmentUploads(): boolean {
  if (DEBUG_ATTACHMENTS) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("nodex.debug.attachments") === "true";
  } catch {
    return false;
  }
}

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (!shouldDebugAttachmentUploads()) return;
  if (payload) {
    console.debug("[attachments]", message, payload);
    return;
  }
  console.debug("[attachments]", message);
}

function parseNip94Tags(tags: unknown): PublishedAttachment | null {
  if (!Array.isArray(tags)) return null;
  const normalized = tags
    .map((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        return `${String(tag[0])} ${String(tag[1])}`;
      }
      if (typeof tag === "string") {
        return tag;
      }
      return "";
    })
    .filter((tag) => tag.length > 0);
  if (normalized.length === 0) return null;
  const asImeta = ["imeta", ...normalized];
  return parseImetaTag(asImeta);
}

function parseNip94EventTags(payload: NIP96UploadResponse): unknown {
  const candidate = payload.nip94_event ?? payload.nip94event;
  if (!candidate) return null;
  if (typeof candidate === "string") {
    try {
      const parsed = JSON.parse(candidate) as { tags?: unknown };
      return parsed.tags ?? null;
    } catch {
      return null;
    }
  }
  return candidate.tags ?? null;
}

function pickUrlFromUploadResponse(payload: NIP96UploadResponse): string | undefined {
  const directCandidates = [
    payload.url,
    payload.download_url,
    payload.media_url,
    payload.file_url,
  ];
  for (const value of directCandidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const data = payload.data as
    | { url?: unknown; download_url?: unknown; media_url?: unknown; file_url?: unknown }
    | Array<{ url?: unknown; download_url?: unknown; media_url?: unknown; file_url?: unknown }>
    | undefined;
  if (Array.isArray(data) && data.length > 0) {
    const entry = data[0];
    const arrayCandidate = entry?.url ?? entry?.download_url ?? entry?.media_url ?? entry?.file_url;
    if (typeof arrayCandidate === "string" && arrayCandidate.trim().length > 0) {
      return arrayCandidate.trim();
    }
  } else if (data && typeof data === "object") {
    const objectCandidate = data.url ?? data.download_url ?? data.media_url ?? data.file_url;
    if (typeof objectCandidate === "string" && objectCandidate.trim().length > 0) {
      return objectCandidate.trim();
    }
  }

  return undefined;
}

async function hashFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return bytesToHex(sha256(new Uint8Array(buffer)));
}

async function detectImageDimensions(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  try {
    const objectUrl = URL.createObjectURL(file);
    const dimensions = await new Promise<string | undefined>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(`${image.naturalWidth}x${image.naturalHeight}`);
      image.onerror = () => resolve(undefined);
      image.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);
    return dimensions;
  } catch {
    return undefined;
  }
}

export async function uploadAttachment(
  file: File,
  optionsOrUploadUrl: UploadAttachmentOptions | string = DEFAULT_UPLOAD_URL || ""
): Promise<PublishedAttachment> {
  const options: UploadAttachmentOptions = typeof optionsOrUploadUrl === "string"
    ? { uploadUrl: optionsOrUploadUrl }
    : optionsOrUploadUrl;
  const uploadUrl = (options.uploadUrl ?? DEFAULT_UPLOAD_URL ?? "").trim();
  const maxFileSizeBytes = getAttachmentMaxFileSizeBytes();
  debugLog("Upload requested", {
    fileName: file.name,
    mimeType: file.type || null,
    size: file.size,
    configuredUploadUrl: uploadUrl || null,
    maxFileSizeBytes,
  });

  if (file.size > maxFileSizeBytes) {
    const maxSizeMb = Math.max(1, Math.ceil(maxFileSizeBytes / (1024 * 1024)));
    throw new Error(`File exceeds maximum upload size of ${maxSizeMb} MB`);
  }

  if (!isAttachmentUploadConfigured(uploadUrl)) {
    console.warn("[attachments] Upload aborted: missing VITE_NIP96_UPLOAD_URL", {
      fileName: file.name,
      size: file.size,
    });
    throw new Error("Attachment upload URL is not configured (VITE_NIP96_UPLOAD_URL)");
  }

  const formData = new FormData();
  formData.append("file", file, file.name);
  const requestHeaders = new Headers();
  if (options.getAuthHeader) {
    try {
      const authHeader = await options.getAuthHeader(uploadUrl, "POST");
      if (authHeader) {
        requestHeaders.set("Authorization", authHeader);
      }
    } catch (error) {
      console.warn("[attachments] Failed to generate upload auth header", {
        fileName: file.name,
        uploadUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const hasAuthorization = requestHeaders.has("Authorization");
  debugLog("Upload auth evaluation complete", {
    fileName: file.name,
    hasAuthorization,
  });

  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "POST",
      headers: requestHeaders,
      body: formData,
    });
  } catch (error) {
    console.error("[attachments] Upload request failed before response", {
      fileName: file.name,
      uploadUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Upload request failed (network/CORS)");
  }

  if (!response.ok) {
    let bodyPreview = "";
    try {
      bodyPreview = (await response.clone().text()).slice(0, 300);
    } catch {
      bodyPreview = "";
    }
    console.warn("[attachments] Upload endpoint responded with error", {
      fileName: file.name,
      uploadUrl,
      status: response.status,
      statusText: response.statusText,
      bodyPreview,
    });
    throw new Error(`Upload failed (${response.status})`);
  }

  let payload: NIP96UploadResponse;
  try {
    payload = (await response.json()) as NIP96UploadResponse;
  } catch {
    console.warn("[attachments] Upload response JSON parsing failed", {
      fileName: file.name,
      uploadUrl,
      contentType: response.headers.get("content-type"),
    });
    throw new Error("Upload response was not valid JSON");
  }

  let attachment: PublishedAttachment | null = null;
  const tags = parseNip94EventTags(payload);
  if (tags) {
    attachment = parseNip94Tags(tags);
  }

  const extractedUrl = pickUrlFromUploadResponse(payload);
  if (!attachment && extractedUrl) {
    attachment = {
      url: extractedUrl,
      mimeType: file.type || undefined,
      size: file.size,
      name: file.name,
    };
  }

  if (!attachment) {
    console.warn("[attachments] Upload response missing attachment URL", {
      fileName: file.name,
      uploadUrl,
      payloadStatus: payload.status || null,
      payloadMessage: payload.message || null,
    });
    throw new Error(payload.message || "Upload response did not include a file URL");
  }

  if (!attachment.sha256) {
    attachment.sha256 = await hashFileSha256(file);
  }
  if (!attachment.mimeType) {
    attachment.mimeType = file.type || undefined;
  }
  if (typeof attachment.size !== "number") {
    attachment.size = file.size;
  }
  if (!attachment.dimensions) {
    attachment.dimensions = await detectImageDimensions(file);
  }
  if (!attachment.name) {
    attachment.name = file.name;
  }

  debugLog("Upload succeeded", {
    fileName: file.name,
    resolvedUrl: attachment.url,
    mimeType: attachment.mimeType || null,
    size: attachment.size ?? null,
  });

  return attachment;
}
