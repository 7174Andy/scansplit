import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { MemoryRouter } from "react-router-dom";
import { Step5Result } from "./Step5Result";
import { useWizardStore } from "@/store/wizardStore";
import { SHARE_BASE_URL } from "@/lib/shareUrl";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));

describe("Step5Result date picker", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });
  afterEach(() => cleanup());

  it("shows the current date on the picker trigger", () => {
    useWizardStore.getState().setDate("2026-01-15");
    render(
      <MemoryRouter>
        <Step5Result onBack={() => {}} />
      </MemoryRouter>
    );
    // The DatePicker trigger button's accessible name is its formatted-date text.
    // Back/Copy/Save buttons don't contain a year, so /2026/ uniquely finds it.
    expect(screen.getByRole("button", { name: /2026/ })).toBeTruthy();
  });

  it("updates the store when a day is picked", async () => {
    useWizardStore.getState().setDate("2026-01-15");
    render(
      <MemoryRouter>
        <Step5Result onBack={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /2026/ }));
    const day = await screen.findByText(
      (content, el) => el?.tagName === "BUTTON" && content.trim() === "20"
    );
    fireEvent.click(day);
    expect(useWizardStore.getState().transaction.date).toBe("2026-01-20");
  });
});

describe("Step5Result share caveat", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });
  afterEach(() => cleanup());

  // The spec requires the bearer-token caveat "near the copy button". It shipped
  // to the README only, so the Copy button's meaning changed without saying so:
  // a user who had been pasting into a private note was now minting a permanent
  // public URL of everyone's name and amount.
  it("warns next to Copy that the link is public and unrevocable", () => {
    render(
      <MemoryRouter>
        <Step5Result onBack={() => {}} />
      </MemoryRouter>
    );
    const warning = screen.getByText(/anyone can open/i);
    expect(warning).toBeTruthy();
    expect(warning.textContent).toMatch(/can'?t be revoked/i);
  });
});

describe("Step5Result copy", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });
  afterEach(() => cleanup());

  // The payer pastes this into a group chat; the link alone carries the split.
  it("copies only the share URL", async () => {
    render(
      <MemoryRouter>
        <Step5Result onBack={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = vi.mocked(writeText).mock.calls[0][0];
    expect(text.startsWith(`${SHARE_BASE_URL}#`)).toBe(true);
    expect(text).not.toMatch(/\s/);
  });
});
