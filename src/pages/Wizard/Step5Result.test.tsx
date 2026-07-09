import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Step5Result } from "./Step5Result";
import { useWizardStore } from "@/store/wizardStore";

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
