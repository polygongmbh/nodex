import { featureDebugLog } from "@/lib/feature-debug";
import i18n from "@/lib/i18n/config";
import { toast } from "sonner";

type ImageCaptionPipeline = (input: string, options?: Record<string, unknown>) => Promise<unknown>;
type LocalCaptionPhase = "runtime-import" | "model-init" | "inference";
type TransformersProgressPayload = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

const TRANSFORMERS_ESM_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm";
const DEFAULT_CAPTION_MODEL_ID = "Xenova/vit-gpt2-image-captioning";
const MAX_CAPTION_CHARS = 160;
const MODEL_IMPORT_TIMEOUT_MS = 30000;
const DEFAULT_MODEL_INIT_TIMEOUT_MS = 25000;
const DEFAULT_CAPTION_INFERENCE_TIMEOUT_MS = 20000;

let imageCaptionPipelinePromise: Promise<ImageCaptionPipeline> | null = null;
let cachedInitializationFailure: { status: LocalImageCaptionStatus; error: string } | null = null;
const notifiedFailureKeys = new Set<string>();
let isCaptionModelReady = false;

const DEFAULT_EXPERIMENTAL_ENABLED = true;
const DEFAULT_REQUIRE_WEBGPU = false;

export type LocalImageCaptionStatus =
  | "unsupported"
  | "initialization_timeout"
  | "initialization_error"
  | "inference_timeout"
  | "inference_error"
  | "success"
  | "empty_result";

export interface LocalImageCaptionResult {
  status: LocalImageCaptionStatus;
  caption: string | null;
  reason?: string;
  error?: string;
}

interface LoadPipelineOptions {
  onModelProgress?: (progress: TransformersProgressPayload) => void;
}

export interface LocalCaptionPolicy {
  experimentalEnabled: boolean;
  requireWebGpu: boolean;
  modelInitTimeoutMs: number;
  inferenceTimeoutMs: number;
}

interface LocalCaptionCapabilities {
  hasWindow: boolean;
  hasFileReader: boolean;
  hasWebAssembly: boolean;
  hasWebGpu: boolean;
  isSecureContext: boolean;
}

class LocalCaptionTimeoutError extends Error {
  readonly phase: LocalCaptionPhase;

  constructor(message: string, phase: LocalCaptionPhase) {
    super(message);
    this.name = "LocalCaptionTimeoutError";
    this.phase = phase;
  }
}

function parseBooleanFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function resolveLocalCaptionPolicy(env: Record<string, unknown> = import.meta.env): LocalCaptionPolicy {
  return {
    experimentalEnabled: parseBooleanFlag(env.VITE_LOCAL_CAPTION_EXPERIMENTAL, DEFAULT_EXPERIMENTAL_ENABLED),
    requireWebGpu: parseBooleanFlag(env.VITE_LOCAL_CAPTION_REQUIRE_WEBGPU, DEFAULT_REQUIRE_WEBGPU),
    modelInitTimeoutMs: parsePositiveInt(env.VITE_LOCAL_CAPTION_INIT_TIMEOUT_MS, DEFAULT_MODEL_INIT_TIMEOUT_MS),
    inferenceTimeoutMs: parsePositiveInt(env.VITE_LOCAL_CAPTION_INFER_TIMEOUT_MS, DEFAULT_CAPTION_INFERENCE_TIMEOUT_MS),
  };
}

function detectLocalCaptionCapabilities(): LocalCaptionCapabilities {
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";
  const secureContext = hasWindow ? window.isSecureContext : false;
  return {
    hasWindow,
    hasFileReader: hasWindow && typeof window.FileReader !== "undefined",
    hasWebAssembly: hasWindow && typeof window.WebAssembly !== "undefined",
    hasWebGpu: hasNavigator && "gpu" in navigator,
    isSecureContext: secureContext,
  };
}

export function resolveLocalCaptionSupport(
  policy: LocalCaptionPolicy,
  capabilities: LocalCaptionCapabilities
): { supported: boolean; reason: string | null } {
  if (!policy.experimentalEnabled) return { supported: false, reason: "experimental_disabled" };
  if (!capabilities.hasWindow) return { supported: false, reason: "non_browser" };
  if (!capabilities.hasWebAssembly) return { supported: false, reason: "webassembly_unavailable" };
  if (!capabilities.hasFileReader) return { supported: false, reason: "filereader_unavailable" };
  if (!capabilities.isSecureContext) return { supported: false, reason: "insecure_context" };
  if (policy.requireWebGpu && !capabilities.hasWebGpu) return { supported: false, reason: "webgpu_required" };
  return { supported: true, reason: null };
}

function mapInferenceFailureMessage(result: LocalImageCaptionResult): string | null {
  switch (result.status) {
    case "unsupported":
      return i18n.t("autoCaption.warnings.unsupported");
    case "initialization_timeout":
    case "inference_timeout":
      return i18n.t("autoCaption.warnings.timeout");
    case "initialization_error":
    case "inference_error":
      return i18n.t("autoCaption.warnings.failed");
    default:
      return null;
  }
}

export function notifyAutoCaptionFailureOnce(result: LocalImageCaptionResult): void {
  const message = mapInferenceFailureMessage(result);
  if (!message) return;
  const dedupeKey = `${result.status}:${result.reason || result.error || "unknown"}`;
  if (notifiedFailureKeys.has(dedupeKey)) return;
  notifiedFailureKeys.add(dedupeKey);
  toast.warning(message);
}

function getCaptionModelId(): string {
  const configured = String(import.meta.env.VITE_LOCAL_CAPTION_MODEL_ID || "").trim();
  return configured || DEFAULT_CAPTION_MODEL_ID;
}

function getNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function formatDurationMs(durationMs: number): number {
  return Number(Math.max(0, durationMs).toFixed(1));
}

function resolveProgressPercent(progress: TransformersProgressPayload): number | null {
  if (typeof progress.progress === "number" && Number.isFinite(progress.progress)) {
    return progress.progress <= 1 ? Math.round(progress.progress * 100) : Math.round(progress.progress);
  }
  if (
    typeof progress.loaded === "number" &&
    Number.isFinite(progress.loaded) &&
    typeof progress.total === "number" &&
    Number.isFinite(progress.total) &&
    progress.total > 0
  ) {
    return Math.round((progress.loaded / progress.total) * 100);
  }
  return null;
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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  phase: LocalCaptionPhase
): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new LocalCaptionTimeoutError(timeoutMessage, phase)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

function classifyInitializationFailure(error: unknown): { status: LocalImageCaptionStatus; message: string } {
  if (error instanceof LocalCaptionTimeoutError) {
    return { status: "initialization_timeout", message: error.message };
  }
  if (error instanceof Error) {
    return { status: "initialization_error", message: error.message };
  }
  return { status: "initialization_error", message: String(error) };
}

function classifyInferenceFailure(error: unknown): { status: LocalImageCaptionStatus; message: string } {
  if (error instanceof LocalCaptionTimeoutError) {
    return { status: "inference_timeout", message: error.message };
  }
  if (error instanceof Error) {
    return { status: "inference_error", message: error.message };
  }
  return { status: "inference_error", message: String(error) };
}

async function loadImageCaptionPipeline(
  policy: LocalCaptionPolicy,
  options: LoadPipelineOptions = {}
): Promise<ImageCaptionPipeline | null> {
  if (imageCaptionPipelinePromise) return imageCaptionPipelinePromise;
  if (cachedInitializationFailure) return null;
  const loadStartedAt = getNowMs();

  imageCaptionPipelinePromise = (async () => {
    featureDebugLog("auto-caption", "Loading local image caption model", {
      modelId: getCaptionModelId(),
      source: "cdn-jsdelivr",
      initTimeoutMs: policy.modelInitTimeoutMs,
    });
    featureDebugLog("auto-caption", "Importing transformers runtime module", {
      timeoutMs: MODEL_IMPORT_TIMEOUT_MS,
    });
    const runtimeImportStartedAt = getNowMs();
    const transformersModule = await withTimeout(
      import(/* @vite-ignore */ TRANSFORMERS_ESM_URL),
      MODEL_IMPORT_TIMEOUT_MS,
      "Local caption runtime import timed out",
      "runtime-import"
    );
    featureDebugLog("auto-caption", "Transformers runtime imported", {
      modelId: getCaptionModelId(),
      importDurationMs: formatDurationMs(getNowMs() - runtimeImportStartedAt),
    });
    if (transformersModule?.env) {
      transformersModule.env.allowLocalModels = false;
      transformersModule.env.useBrowserCache = true;
    }
    featureDebugLog("auto-caption", "Initializing caption pipeline", {
      modelId: getCaptionModelId(),
      timeoutMs: policy.modelInitTimeoutMs,
    });
    const modelInitStartedAt = getNowMs();
    const pipeline = await withTimeout(
      transformersModule.pipeline("image-to-text", getCaptionModelId(), {
        progress_callback: (progress: TransformersProgressPayload) => {
          options.onModelProgress?.(progress);
        },
      }),
      policy.modelInitTimeoutMs,
      "Local caption model initialization timed out",
      "model-init"
    );
    featureDebugLog("auto-caption", "Local image caption model ready", {
      modelId: getCaptionModelId(),
      modelInitDurationMs: formatDurationMs(getNowMs() - modelInitStartedAt),
      totalLoadDurationMs: formatDurationMs(getNowMs() - loadStartedAt),
    });
    isCaptionModelReady = true;
    return pipeline as ImageCaptionPipeline;
  })();

  try {
    return await imageCaptionPipelinePromise;
  } catch (error) {
    const classification = classifyInitializationFailure(error);
    cachedInitializationFailure = {
      status: classification.status,
      error: classification.message,
    };
    imageCaptionPipelinePromise = null;
    console.warn("[auto-caption] Local image caption model failed to initialize", {
      error: classification.message,
      status: classification.status,
      durationMs: formatDurationMs(getNowMs() - loadStartedAt),
    });
    featureDebugLog("auto-caption", "Local model initialization failed", {
      error: classification.message,
      status: classification.status,
      durationMs: formatDurationMs(getNowMs() - loadStartedAt),
    });
    return null;
  }
}

export async function preloadLocalImageCaptionModel(): Promise<LocalImageCaptionResult> {
  if (isCaptionModelReady) {
    featureDebugLog("auto-caption", "Model preload skipped because model is already ready");
    return { status: "success", caption: null };
  }

  const toastId = "auto-caption-model-download";
  const policy = resolveLocalCaptionPolicy();
  const capabilities = detectLocalCaptionCapabilities();
  const support = resolveLocalCaptionSupport(policy, capabilities);
  if (!support.supported) {
    const result: LocalImageCaptionResult = {
      status: "unsupported",
      caption: null,
      reason: support.reason || undefined,
    };
    notifyAutoCaptionFailureOnce(result);
    return result;
  }

  toast.loading(i18n.t("autoCaption.toasts.preparingModel"), { id: toastId });
  let lastProgressBucket = -1;
  const preloadStartedAt = getNowMs();
  const pipeline = await loadImageCaptionPipeline(policy, {
    onModelProgress: (progress) => {
      const percent = resolveProgressPercent(progress);
      if (percent !== null) {
        const bucket = Math.floor(percent / 5);
        if (bucket === lastProgressBucket) return;
        lastProgressBucket = bucket;
        toast.loading(i18n.t("autoCaption.toasts.downloadingModel", {
          progress: Math.max(0, Math.min(100, percent)),
        }), { id: toastId });
      }
      featureDebugLog("auto-caption", "Caption model download progress", {
        status: progress.status || null,
        file: progress.file || null,
        progressPercent: percent,
      });
    },
  });

  if (!pipeline) {
    const result: LocalImageCaptionResult = cachedInitializationFailure
      ? {
          status: cachedInitializationFailure.status,
          caption: null,
          error: cachedInitializationFailure.error,
        }
      : {
          status: "initialization_error",
          caption: null,
          error: i18n.t("autoCaption.errors.modelUnavailable"),
        };
    notifyAutoCaptionFailureOnce(result);
    toast.error(i18n.t("autoCaption.toasts.downloadFailed"), { id: toastId });
    return result;
  }

  toast.success(i18n.t("autoCaption.toasts.modelReady"), { id: toastId });
  featureDebugLog("auto-caption", "Local caption model preload completed", {
    durationMs: formatDurationMs(getNowMs() - preloadStartedAt),
  });
  return { status: "success", caption: null };
}

export async function generateLocalImageCaption(file: File): Promise<LocalImageCaptionResult> {
  if (!file.type.startsWith("image/")) return { status: "empty_result", caption: null };
  const inferenceStartedAt = getNowMs();
  const toastId = `auto-caption-generate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toast.loading(i18n.t("autoCaption.toasts.generating", { fileName: file.name }), { id: toastId });

  const policy = resolveLocalCaptionPolicy();
  const capabilities = detectLocalCaptionCapabilities();
  const support = resolveLocalCaptionSupport(policy, capabilities);
  if (!support.supported) {
    featureDebugLog("auto-caption", "Local caption inference skipped by capability gate", {
      reason: support.reason,
      policy,
      capabilities,
    });
    toast.dismiss(toastId);
    return { status: "unsupported", caption: null, reason: support.reason || undefined };
  }

  featureDebugLog("auto-caption", "Starting local caption inference", {
    fileName: file.name,
    size: file.size,
    mimeType: file.type || null,
    policy,
  });
  const pipeline = await loadImageCaptionPipeline(policy);
  if (!pipeline) {
    const initializationFailure = cachedInitializationFailure;
    if (initializationFailure) {
      toast.dismiss(toastId);
      return {
        status: initializationFailure.status,
        caption: null,
        error: initializationFailure.error,
      };
    }
    toast.dismiss(toastId);
    return { status: "initialization_error", caption: null, error: i18n.t("autoCaption.errors.pipelineUnavailable") };
  }

  try {
    toast.loading(i18n.t("autoCaption.toasts.preparingImage", { fileName: file.name }), { id: toastId });
    const imageReadStartedAt = getNowMs();
    const dataUrl = await fileToDataUrl(file);
    featureDebugLog("auto-caption", "Image converted to data URL for caption inference", {
      fileName: file.name,
      dataUrlLength: dataUrl.length,
      imageReadDurationMs: formatDurationMs(getNowMs() - imageReadStartedAt),
    });
    featureDebugLog("auto-caption", "Invoking caption pipeline", {
      fileName: file.name,
      timeoutMs: policy.inferenceTimeoutMs,
    });
    toast.loading(i18n.t("autoCaption.toasts.generatingWithModel", { fileName: file.name }), { id: toastId });
    const modelInferenceStartedAt = getNowMs();
    const result = await withTimeout(
      pipeline(dataUrl, {
        max_new_tokens: 24,
      }),
      policy.inferenceTimeoutMs,
      "Local caption inference timed out",
      "inference"
    );
    const caption = extractCaptionFromInference(result);
    if (!caption) {
      featureDebugLog("auto-caption", "Inference returned no usable caption text", {
        fileName: file.name,
        resultType: Array.isArray(result) ? "array" : typeof result,
      });
      toast.dismiss(toastId);
      return { status: "empty_result", caption: null };
    }
    featureDebugLog("auto-caption", "Local inference completed", {
      fileName: file.name,
      generated: Boolean(caption),
      inferenceDurationMs: formatDurationMs(getNowMs() - modelInferenceStartedAt),
      totalDurationMs: formatDurationMs(getNowMs() - inferenceStartedAt),
    });
    toast.success(i18n.t("autoCaption.toasts.generated", { fileName: file.name }), { id: toastId });
    return { status: "success", caption };
  } catch (error) {
    const classification = classifyInferenceFailure(error);
    console.warn("[auto-caption] Local image caption inference failed", {
      fileName: file.name,
      size: file.size,
      mimeType: file.type || null,
      error: classification.message,
      status: classification.status,
    });
    featureDebugLog("auto-caption", "Local inference failed", {
      fileName: file.name,
      error: classification.message,
      status: classification.status,
      durationMs: formatDurationMs(getNowMs() - inferenceStartedAt),
    });
    toast.dismiss(toastId);
    return {
      status: classification.status,
      caption: null,
      error: classification.message,
    };
  }
}
