import { describe, expect, it } from "vitest";
import { buildAuthRoute, resolveAuthRouteStep } from "./auth-routes";

describe("auth-routes", () => {
  it("maps routeable auth steps to stable URLs", () => {
    expect(buildAuthRoute("noas")).toBe("/signin");
    expect(buildAuthRoute("noasSignUp")).toBe("/signup");
  });

  it("resolves supported auth URLs back to modal steps", () => {
    expect(resolveAuthRouteStep("/signin")).toBe("noas");
    expect(resolveAuthRouteStep("/signup")).toBe("noasSignUp");
    expect(resolveAuthRouteStep("/feed")).toBeNull();
  });
});
