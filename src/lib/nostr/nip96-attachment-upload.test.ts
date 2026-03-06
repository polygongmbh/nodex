import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAttachmentMaxFileSizeBytes, uploadAttachment } from "./nip96-attachment-upload";

if (typeof File !== "undefined" && typeof File.prototype.arrayBuffer !== "function") {
  Object.defineProperty(File.prototype, "arrayBuffer", {
    value: function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
      if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer === "function") {
        return Blob.prototype.arrayBuffer.call(this);
      }
      if (typeof this.text === "function") {
        return this.text().then((value) => new TextEncoder().encode(value).buffer);
      }
      return Promise.resolve(new ArrayBuffer(0));
    },
  });
}

describe("uploadAttachment NIP-98 integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("includes Authorization header when auth callback returns one", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            url: "https://cdn.example.com/file.png",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      );

    const file = new File(["hello"], "file.png", { type: "image/png" });
    const authSpy = vi.fn(async () => "Nostr abc123");

    const uploaded = await uploadAttachment(file, {
      uploadUrl: "https://upload.example.com/api/v1/upload",
      getAuthHeader: authSpy,
    });

    expect(uploaded.url).toBe("https://cdn.example.com/file.png");
    expect(authSpy).toHaveBeenCalledWith("https://upload.example.com/api/v1/upload", "POST");

    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(requestInit.headers);
    expect(headers.get("Authorization")).toBe("Nostr abc123");
  });

  it("uploads without Authorization when auth callback returns null", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ url: "https://cdn.example.com/file.pdf" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    const file = new File(["hello"], "file.pdf", { type: "application/pdf" });
    await uploadAttachment(file, {
      uploadUrl: "https://upload.example.com/api/v1/upload",
      getAuthHeader: async () => null,
    });

    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(requestInit.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("accepts stringified nip94_event payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          message: "Upload successful.",
          nip94_event: JSON.stringify({
            tags: [
              ["url", "https://cdn.example.com/from-nip94.jpg"],
              ["m", "image/jpeg"],
            ],
          }),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const file = new File(["hello"], "from-nip94.jpg", { type: "image/jpeg" });
    const uploaded = await uploadAttachment(file, {
      uploadUrl: "https://upload.example.com/api/v1/upload",
      getAuthHeader: async () => "Nostr abc123",
    });

    expect(uploaded.url).toBe("https://cdn.example.com/from-nip94.jpg");
    expect(uploaded.mimeType).toBe("image/jpeg");
  });

  it("accepts nested data URL payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "success",
          message: "Upload successful.",
          data: [{ url: "https://cdn.example.com/from-data.pdf" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );

    const file = new File(["hello"], "from-data.pdf", { type: "application/pdf" });
    const uploaded = await uploadAttachment(file, {
      uploadUrl: "https://upload.example.com/api/v1/upload",
    });

    expect(uploaded.url).toBe("https://cdn.example.com/from-data.pdf");
  });

  it("rejects files that exceed configured maximum upload size", async () => {
    (import.meta.env as Record<string, string>).VITE_NIP96_MAX_UPLOAD_BYTES = "10";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const file = new File(["hello world"], "too-big.txt", { type: "text/plain" });

    await expect(
      uploadAttachment(file, {
        uploadUrl: "https://upload.example.com/api/v1/upload",
      })
    ).rejects.toThrow("File exceeds maximum upload size of 1 MB");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaults to a 100 MB max upload size when env is unset", () => {
    delete (import.meta.env as Record<string, string>).VITE_NIP96_MAX_UPLOAD_BYTES;
    expect(getAttachmentMaxFileSizeBytes()).toBe(100 * 1024 * 1024);
  });
});
