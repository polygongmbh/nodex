import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadAttachment } from "./attachment-upload";

if (typeof File !== "undefined" && typeof File.prototype.arrayBuffer !== "function") {
  Object.defineProperty(File.prototype, "arrayBuffer", {
    value: function arrayBuffer(this: Blob) {
      return new Response(this).arrayBuffer();
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
});
