import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
    const select = screen.getByLabelText(/paid by/i) as HTMLSelectElement;
    const alice = useWizardStore.getState().people[0];
    expect(select.value).toBe(alice.id);
  });

  it("updates the store when the user picks a different payer", () => {
    useWizardStore.getState().addPerson("Alice");
    useWizardStore.getState().addPerson("Bob");
    render(<Step3People onBack={() => {}} onNext={() => {}} />);
    const select = screen.getByLabelText(/paid by/i) as HTMLSelectElement;
    const bob = useWizardStore.getState().people[1];
    fireEvent.change(select, { target: { value: bob.id } });
    expect(useWizardStore.getState().transaction.paidByPersonId).toBe(bob.id);
  });

  it("disables Next when there are people but no payer", () => {
    // Simulate legacy-edit case: people present, payer null.
    useWizardStore.getState().setPeople([
      { id: "p1", transactionId: "t", name: "Alice", position: 0, paidAt: null },
    ]);
    useWizardStore.getState().setPayer(null);
    render(<Step3People onBack={() => {}} onNext={() => {}} />);
    const next = screen.getByRole("button", { name: /next/i }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });
});
