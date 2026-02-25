import { afterEach, describe, expect, it } from "vitest";

import {
  getAttachmentPickerMode,
  NON_IMAGE_ATTACHMENT_ACCEPT,
  shouldPreferNonImageFilePickerOnIOS,
} from "@/lib/attachment-file-picker";

type NavigatorDescriptor = {
  platform?: string;
  userAgent?: string;
  maxTouchPoints?: number;
};

const originalPlatform = Object.getOwnPropertyDescriptor(window.navigator, "platform");
const originalUserAgent = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(window.navigator, "maxTouchPoints");

function mockNavigator(descriptor: NavigatorDescriptor): void {
  if (descriptor.platform !== undefined) {
    Object.defineProperty(window.navigator, "platform", {
      configurable: true,
      value: descriptor.platform,
    });
  }
  if (descriptor.userAgent !== undefined) {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: descriptor.userAgent,
    });
  }
  if (descriptor.maxTouchPoints !== undefined) {
    Object.defineProperty(window.navigator, "maxTouchPoints", {
      configurable: true,
      value: descriptor.maxTouchPoints,
    });
  }
}

function restoreNavigatorProperty(key: "platform" | "userAgent" | "maxTouchPoints", original?: PropertyDescriptor): void {
  if (original) {
    Object.defineProperty(window.navigator, key, original);
  }
}

afterEach(() => {
  restoreNavigatorProperty("platform", originalPlatform);
  restoreNavigatorProperty("userAgent", originalUserAgent);
  restoreNavigatorProperty("maxTouchPoints", originalMaxTouchPoints);
});

describe("attachment file picker helpers", () => {
  it("exports a non-image accept list for file attachments", () => {
    expect(NON_IMAGE_ATTACHMENT_ACCEPT).toBe("application/*,text/*,audio/*,video/*");
  });

  it("prefers non-image picker on iPhone user agents", () => {
    mockNavigator({
      platform: "iPhone",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      maxTouchPoints: 5,
    });

    expect(shouldPreferNonImageFilePickerOnIOS()).toBe(true);
  });

  it("prefers non-image picker for iPadOS desktop user agents", () => {
    mockNavigator({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      maxTouchPoints: 5,
    });

    expect(shouldPreferNonImageFilePickerOnIOS()).toBe(true);
  });

  it("does not force non-image picker on non-iOS platforms", () => {
    mockNavigator({
      platform: "Linux x86_64",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      maxTouchPoints: 0,
    });

    expect(shouldPreferNonImageFilePickerOnIOS()).toBe(false);
  });

  it("uses separate pickers on desktop platforms", () => {
    mockNavigator({
      platform: "Win32",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      maxTouchPoints: 0,
    });

    expect(getAttachmentPickerMode()).toBe("separate");
  });

  it("uses unified picker mode on macOS desktop browsers", () => {
    mockNavigator({
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      maxTouchPoints: 0,
    });

    expect(getAttachmentPickerMode()).toBe("unified");
  });

  it("uses unified picker mode on Android mobile browsers", () => {
    mockNavigator({
      platform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
      maxTouchPoints: 5,
    });

    expect(getAttachmentPickerMode()).toBe("unified");
  });

  it("uses unified picker mode for unknown mobile-like agents", () => {
    mockNavigator({
      platform: "",
      userAgent: "Mozilla/5.0 (Mobile; rv:124.0) Gecko/124.0 Firefox/124.0",
      maxTouchPoints: 5,
    });

    expect(getAttachmentPickerMode()).toBe("unified");
  });
});
