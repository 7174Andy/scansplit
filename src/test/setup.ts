import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest setup: stubs/mocks shared across tests.
// Tauri's `invoke` is mocked per-test as needed; nothing global yet.

// RTL doesn't auto-cleanup without globals:true, so wire it up explicitly.
afterEach(() => {
  cleanup();
});
