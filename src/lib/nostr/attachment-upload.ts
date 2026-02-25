import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { PublishedAttachment } from "@/types";
import { parseImetaTag } from "@/lib/attachments";

interface NIP96UploadResponse {
  status?: string;
  message?: string;
  url?: string;
  nip94_event?: {
    tags?: string[][];
  };
}

const DEFAULT_UPLOAD_URL = import.meta.env.VITE_NIP96_UPLOAD_URL as string | undefined;
const DEBUG_ATTACHMENTS = String(import.meta.env.VITE_DEBUG_ATTACHMENTS || "").toLowerCase() === "true";

export interface UploadAttachmentOptions {
  uploadUrl?: string;
  getAuthHeader?: (url: string, method: "POST") => Promise<string | null> | string | null;
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
    console.info("[attachments]", message, payload);
    return;
  }
  console.info("[attachments]", message);
}

function parseNip94Tags(tags: string[][]): PublishedAttachment | null {
  const asImeta = ["imeta", ...tags.filter((tag) => tag.length >= 2).map((tag) => `${tag[0]} ${tag[1]}`)];
  return parseImetaTag(asImeta);
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
  debugLog("Upload requested", {
    fileName: file.name,
    mimeType: file.type || null,
    size: file.size,
    configuredUploadUrl: uploadUrl || null,
  });

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
  const tags = payload.nip94_event?.tags;
  if (tags && Array.isArray(tags)) {
    attachment = parseNip94Tags(tags);
  }

  if (!attachment && payload.url) {
    attachment = {
      url: payload.url,
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
