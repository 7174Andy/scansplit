import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Step5Result } from "./Step5Result";
import { useWizardStore } from "@/store/wizardStore";

describe("Step5Result date input", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });
  afterEach(() => cleanup());

  it("renders a date input bound to transaction.date", () => {
    useWizardStore.getState().setDate("2026-01-15");
    const { container } = render(
      <MemoryRouter>
        <Step5Result onBack={() => {}} />
      </MemoryRouter>
    );
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("2026-01-15");
  });

  it("updates the store when the date changes", () => {
    const { container } = render(
      <MemoryRouter>
        <Step5Result onBack={() => {}} />
      </MemoryRouter>
    );
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-12-25" } });
    expect(useWizardStore.getState().transaction.date).toBe("2026-12-25");
  });
});
