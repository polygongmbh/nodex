import { featureDebugLog } from "@/lib/feature-debug";

type ImageCaptionPipeline = (input: string, options?: Record<string, unknown>) => Promise<unknown>;

const TRANSFORMERS_ESM_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm";
const DEFAULT_CAPTION_MODEL_ID = "Xenova/vit-gpt2-image-captioning";
const MAX_CAPTION_CHARS = 160;
const MODEL_IMPORT_TIMEOUT_MS = 30000;
const MODEL_INIT_TIMEOUT_MS = 120000;
const CAPTION_INFERENCE_TIMEOUT_MS = 45000;

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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function loadImageCaptionPipeline(): Promise<ImageCaptionPipeline | null> {
  if (imageCaptionPipelinePromise) return imageCaptionPipelinePromise;

  imageCaptionPipelinePromise = (async () => {
    try {
      featureDebugLog("auto-caption", "Loading local image caption model", {
        modelId: getCaptionModelId(),
        source: "cdn-jsdelivr",
      });
      featureDebugLog("auto-caption", "Importing transformers runtime module", {
        timeoutMs: MODEL_IMPORT_TIMEOUT_MS,
      });
      const transformersModule = await withTimeout(
        import(/* @vite-ignore */ TRANSFORMERS_ESM_URL),
        MODEL_IMPORT_TIMEOUT_MS,
        "Local caption runtime import timed out"
      );
      featureDebugLog("auto-caption", "Transformers runtime imported", {
        modelId: getCaptionModelId(),
      });
      if (transformersModule?.env) {
        transformersModule.env.allowLocalModels = false;
        transformersModule.env.useBrowserCache = true;
      }
      featureDebugLog("auto-caption", "Initializing caption pipeline", {
        modelId: getCaptionModelId(),
        timeoutMs: MODEL_INIT_TIMEOUT_MS,
      });
      const pipeline = await withTimeout(
        transformersModule.pipeline("image-to-text", getCaptionModelId()),
        MODEL_INIT_TIMEOUT_MS,
        "Local caption model initialization timed out"
      );
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
  featureDebugLog("auto-caption", "Starting local caption inference", {
    fileName: file.name,
    size: file.size,
    mimeType: file.type || null,
  });
  const pipeline = await loadImageCaptionPipeline();
  if (!pipeline) return null;

  try {
    const dataUrl = await fileToDataUrl(file);
    featureDebugLog("auto-caption", "Image converted to data URL for caption inference", {
      fileName: file.name,
      dataUrlLength: dataUrl.length,
    });
    featureDebugLog("auto-caption", "Invoking caption pipeline", {
      fileName: file.name,
      timeoutMs: CAPTION_INFERENCE_TIMEOUT_MS,
    });
    const result = await withTimeout(
      pipeline(dataUrl, {
        max_new_tokens: 24,
      }),
      CAPTION_INFERENCE_TIMEOUT_MS,
      "Local caption inference timed out"
    );
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
