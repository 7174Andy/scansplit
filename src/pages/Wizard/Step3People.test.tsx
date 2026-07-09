import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3People } from "./Step3People";
import { useWizardStore } from "../../store/wizardStore";

describe("Step3People — Paid by selector", () => {
  beforeEach(() => useWizardStore.getState().reset());
  afterEach(() => cleanup());

  it("does not render the selector when no people exist", () => {
    render(<Step3People onBack={() => {}} onNext={() => {}} />);
    expect(screen.queryByLabelText(/paid by/i)).toBeNull();
  });

  it("renders the selector with the first person auto-selected", () => {
    useWizardStore.getState().addPerson("Alice");
    useWizardStore.getState().addPerson("Bob");
    render(<Step3People onBack={() => {}} onNext={() => {}} />);
    // The Radix SelectTrigger shows the selected SelectItem's text.
    const trigger = screen.getByLabelText(/paid by/i);
    expect(trigger.textContent).toContain("Alice");
  });

  it("re-renders the trigger when payer changes in the store", () => {
    useWizardStore.getState().addPerson("Alice");
    useWizardStore.getState().addPerson("Bob");
    const { rerender } = render(<Step3People onBack={() => {}} onNext={() => {}} />);
    expect(screen.getByLabelText(/paid by/i).textContent).toContain("Alice");
    const bob = useWizardStore.getState().people[1];
    useWizardStore.getState().setPayer(bob.id);
    rerender(<Step3People onBack={() => {}} onNext={() => {}} />);
    expect(screen.getByLabelText(/paid by/i).textContent).toContain("Bob");
  });

  it("disables Next when there are people but no payer (legacy-edit case)", () => {
    // loadFrom sets isExisting=true, so the self-heal effect is suppressed.
    useWizardStore.getState().loadFrom({
      transaction: { id: "t", title: "x", currency: "USD", createdAt: 0, updatedAt: 0, paidByPersonId: null, date: "2026-01-01" },
      people: [{ id: "p1", transactionId: "t", name: "Alice", position: 0, paidAt: null }],
      receipts: [],
      items: [],
    });
    render(<Step3People onBack={() => {}} onNext={() => {}} />);
    const next = screen.getByRole("button", { name: /next/i }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it("self-heals payer when wizard is fresh and people exist without a payer", () => {
    // Simulate stale persisted state: people present but payer null,
    // isExisting is false (fresh wizard, not a loaded saved transaction).
    useWizardStore.getState().setPeople([
      { id: "p1", transactionId: "t", name: "Alice", position: 0, paidAt: null },
    ]);
    useWizardStore.getState().setPayer(null);
    // isExisting is false after reset (beforeEach resets the store).
    render(<Step3People onBack={() => {}} onNext={() => {}} />);
    expect(useWizardStore.getState().transaction.paidByPersonId).toBe("p1");
  });
});
