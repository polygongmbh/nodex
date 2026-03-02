import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import { NostrEventKind } from "./types";

function encodeBase64(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64");
  }
  throw new Error("No base64 encoder available");
}

export async function createNip98AuthHeader(
  ndk: NDK | null,
  url: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
): Promise<string | null> {
  if (!ndk || !ndk.signer) {
    return null;
  }

  try {
    const authEvent = new NDKEvent(ndk);
    authEvent.kind = NostrEventKind.HttpAuth;
    authEvent.content = "";
    authEvent.tags = [
      ["u", url],
      ["method", method.toUpperCase()],
    ];
    await authEvent.sign();

    const serialized = JSON.stringify({
      id: authEvent.id,
      pubkey: authEvent.pubkey,
      created_at: authEvent.created_at,
      kind: authEvent.kind,
      tags: authEvent.tags,
      content: authEvent.content,
      sig: authEvent.sig,
    });
    return `Nostr ${encodeBase64(serialized)}`;
  } catch (error) {
    console.warn("Failed to create NIP-98 auth header", error);
    return null;
  }
}
