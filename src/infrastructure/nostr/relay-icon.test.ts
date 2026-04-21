import { describe, expect, it } from "vitest";
import { Building2, Cpu, Gamepad2, PlayCircle, RadioTower, Rss, Users, ListTodo } from "lucide-react";
import { resolveRelayIcon } from "./relay-icon";

describe("resolveRelayIcon", () => {
  it("uses configured icons for known relay host prefixes", () => {
    expect(resolveRelayIcon("wss://feed.example.com")).toBe(Rss);
    expect(resolveRelayIcon("wss://tasks.example.com")).toBe(ListTodo);
    expect(resolveRelayIcon("wss://base.example.com")).toBe(Building2);
    expect(resolveRelayIcon("wss://relay.example.com")).toBe(RadioTower);
    expect(resolveRelayIcon("wss://nostr.example.com")).toBe(Cpu);
    expect(resolveRelayIcon("wss://demo.test")).toBe(PlayCircle);
  });

  it("uses a stable hash fallback for unknown prefixes", () => {
    const first = resolveRelayIcon("wss://alpha.example.com");
    const second = resolveRelayIcon("wss://alpha.example.com");
    expect(second).toBe(first);
    expect([Building2, Users, Gamepad2, Cpu]).toContain(first);
  });

  it("falls back deterministically for bare hosts without a known prefix", () => {
    const icon = resolveRelayIcon("wss://nodex.nexus");
    expect(resolveRelayIcon("wss://nodex.nexus")).toBe(icon);
  });
});
