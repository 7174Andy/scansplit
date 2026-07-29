// Detects only the OS. Architecture is deliberately not detected:
// navigator.userAgentData is Chromium-only, and every Mac reports "Intel"
// in its user-agent string regardless of the actual CPU. The release ships
// one installer per OS so no architecture decision is ever needed here.
export function detectOS(userAgent) {
  if (typeof userAgent !== "string" || userAgent === "") return null;

  // Mobile first — these UAs contain desktop OS tokens.
  if (/Android/i.test(userAgent)) return null;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return null;

  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macos";
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Linux|X11/i.test(userAgent)) return "linux";

  return null;
}
