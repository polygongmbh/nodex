import { featureDebugLog } from "@/lib/feature-debug";

type ImageCaptionPipeline = (input: string, options?: Record<string, unknown>) => Promise<unknown>;

const TRANSFORMERS_ESM_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm";
const DEFAULT_CAPTION_MODEL_ID = "Xenova/vit-gpt2-image-captioning";
const MAX_CAPTION_CHARS = 160;

let imageCaptionPipelinePromise: Promise<ImageCaptionPipeline | null> | null = null;

function getCaptionModelId(): string {
  const configured = String(import.meta.env.VITE_LOCAL_CAPTION_MODEL_ID || "").trim();
  return configured || DEFAULT_CAPTION_MODEL_ID;
}

function normalizeCaption(caption: string): string {
  const normalizedWhitespace = caption.replace(/\s+/g, " ").trim();
  const withoutTrailingPeriod = normalizedWhitespace.replace(/\.+$/, "");
  const clipped = withoutTrailingPeriod.slice(0, MAX_CAPTION_CHARS).trim();
  if (!clipped) return "";
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

function extractGeneratedText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractGeneratedText(item);
      if (extracted) return extracted;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const generated = (value as { generated_text?: unknown }).generated_text;
    if (typeof generated === "string") return generated;
  }
  return null;
}

export function extractCaptionFromInference(result: unknown): string | null {
  const generated = extractGeneratedText(result);
  if (typeof generated !== "string") return null;
  const normalized = normalizeCaption(generated);
  return normalized || null;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to convert file to data URL"));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file for local caption inference"));
    reader.readAsDataURL(file);
  });
}

async function loadImageCaptionPipeline(): Promise<ImageCaptionPipeline | null> {
  if (imageCaptionPipelinePromise) return imageCaptionPipelinePromise;

  imageCaptionPipelinePromise = (async () => {
    try {
      featureDebugLog("auto-caption", "Loading local image caption model", {
        modelId: getCaptionModelId(),
        source: "cdn-jsdelivr",
      });
      const transformersModule = await import(/* @vite-ignore */ TRANSFORMERS_ESM_URL);
      if (transformersModule?.env) {
        transformersModule.env.allowLocalModels = false;
        transformersModule.env.useBrowserCache = true;
      }
      const pipeline = await transformersModule.pipeline("image-to-text", getCaptionModelId());
      featureDebugLog("auto-caption", "Local image caption model ready", {
        modelId: getCaptionModelId(),
      });
      return pipeline as ImageCaptionPipeline;
    } catch (error) {
      console.warn("[auto-caption] Local image caption model failed to initialize", {
        error: error instanceof Error ? error.message : String(error),
      });
      featureDebugLog("auto-caption", "Local model initialization failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  })();

  return imageCaptionPipelinePromise;
}

export async function generateLocalImageCaption(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const pipeline = await loadImageCaptionPipeline();
  if (!pipeline) return null;

  try {
    const dataUrl = await fileToDataUrl(file);
    const result = await pipeline(dataUrl, {
      max_new_tokens: 24,
    });
    const caption = extractCaptionFromInference(result);
    if (!caption) {
      featureDebugLog("auto-caption", "Inference returned no usable caption text", {
        fileName: file.name,
        resultType: Array.isArray(result) ? "array" : typeof result,
      });
    }
    featureDebugLog("auto-caption", "Local inference completed", {
      fileName: file.name,
      generated: Boolean(caption),
    });
    return caption;
  } catch (error) {
    console.warn("[auto-caption] Local image caption inference failed", {
      fileName: file.name,
      size: file.size,
      mimeType: file.type || null,
      error: error instanceof Error ? error.message : String(error),
    });
    featureDebugLog("auto-caption", "Local inference failed", {
      fileName: file.name,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
