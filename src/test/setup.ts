import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest setup: stubs/mocks shared across tests.
// Tauri's `invoke` is mocked per-test as needed; nothing global yet.

// jsdom lacks pointer-capture and scrollIntoView, which Radix primitives
// (Popover, Select) call when opening/focusing. Stub them as no-ops.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// RTL doesn't auto-cleanup without globals:true, so wire it up explicitly.
afterEach(() => {
  cleanup();
});
