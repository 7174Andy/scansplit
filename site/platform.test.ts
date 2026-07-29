import { describe, it, expect } from "vitest";
import { detectOS } from "./platform.js";

const CASES: Array<[string, string, "macos" | "windows" | "linux" | null]> = [
  [
    "macOS Safari",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "macos",
  ],
  [
    "macOS Chrome on Apple Silicon (still reports Intel)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "macos",
  ],
  [
    "Windows Chrome",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "windows",
  ],
  [
    "Windows Firefox",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "windows",
  ],
  [
    "Linux Firefox",
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "linux",
  ],
  [
    "iOS Safari",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    null,
  ],
  [
    // True desktop-mode iPadOS Safari sends a Macintosh UA indistinguishable
    // from real macOS by user-agent alone, and will be offered the Mac build.
    "iPadOS Safari (mobile UA)",
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    null,
  ],
  [
    "Android Chrome",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    null,
  ],
];

describe("detectOS", () => {
  for (const [label, ua, expected] of CASES) {
    it(`maps ${label} to ${String(expected)}`, () => {
      expect(detectOS(ua)).toBe(expected);
    });
  }

  it("returns null for an empty or junk user agent", () => {
    expect(detectOS("")).toBeNull();
    expect(detectOS("curl/8.4.0")).toBeNull();
  });
});
