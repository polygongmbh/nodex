import { describe, expect, it } from "vitest";
import { resolveRootDomainHostname } from "./root-domain";

describe("resolveRootDomainHostname", () => {
  it.each([
    ["app.example.com", "example.com"],
    ["example.com", "example.com"],
    ["LOCALHOST", "localhost"],
    ["192.168.1.5", "192.168.1.5"],
    ["2001:db8::1", "2001:db8::1"],
    ["app.example.com.", "example.com"],
  ])("maps %s to %s", (input, expected) => {
    expect(resolveRootDomainHostname(input)).toBe(expected);
  });
});
