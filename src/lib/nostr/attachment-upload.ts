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

export async function uploadAttachment(file: File, uploadUrl: string = DEFAULT_UPLOAD_URL || ""): Promise<PublishedAttachment> {
  if (!uploadUrl) {
    throw new Error("Attachment upload URL is not configured (VITE_NIP96_UPLOAD_URL)");
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }

  let payload: NIP96UploadResponse;
  try {
    payload = (await response.json()) as NIP96UploadResponse;
  } catch {
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

  return attachment;
}
