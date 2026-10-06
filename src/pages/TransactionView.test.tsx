import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TransactionView from "./TransactionView";
import { api } from "@/lib/tauri";
import type { FullTransaction } from "@/lib/types";

function sampleFull(): FullTransaction {
  return {
    transaction: { id: "t1", title: "Dinner", currency: "USD", createdAt: 0, updatedAt: 0, paidByPersonId: null, date: "2026-01-01" },
    people: [
      { id: "p1", transactionId: "t1", name: "Alice", position: 0, paidAt: null },
      { id: "p2", transactionId: "t1", name: "Bob", position: 1, paidAt: null },
    ],
    receipts: [],
    items: [
      {
        id: "i1", transactionId: "t1", name: "Pizza", priceCents: 1000,
        kind: "item", position: 0, assignedPersonIds: [],
      },
    ],
  };
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={["/transaction/t1"]}>
      <Routes>
        <Route path="/transaction/:id" element={<TransactionView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TransactionView payer header and locked row", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows payer header and disables payer checkbox when paidByPersonId is set", async () => {
    const full: FullTransaction = {
      ...sampleFull(),
      transaction: {
        ...sampleFull().transaction,
        paidByPersonId: "p1",
      },
    };
    vi.spyOn(api, "getTransaction").mockResolvedValue(full);
    renderView();

    // Header text
    expect(await screen.findByText(/Alice paid\. Splitting the rest:/i)).toBeTruthy();

    // Alice's checkbox should be checked and disabled (she is the payer)
    const aliceBox = await screen.findByRole("checkbox", { name: /Alice paid this bill/i });
    expect((aliceBox as HTMLInputElement).checked).toBe(true);
    expect((aliceBox as HTMLInputElement).disabled).toBe(true);

    // Bob's checkbox should be enabled (not the payer, paidAt is null → unchecked)
    const bobBox = await screen.findByRole("checkbox", { name: /Mark Bob paid/ });
    expect((bobBox as HTMLInputElement).disabled).toBe(false);
    expect((bobBox as HTMLInputElement).checked).toBe(false);
  });
});

describe("TransactionView paid toggle", () => {
  beforeEach(() => {
    vi.spyOn(api, "getTransaction").mockResolvedValue(sampleFull());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("toggles paid optimistically and calls api.setPersonPaid", async () => {
    const setSpy = vi.spyOn(api, "setPersonPaid").mockResolvedValue();
    renderView();

    const aliceBox = await screen.findByRole("checkbox", { name: /Mark Alice paid/ });
    expect((aliceBox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(aliceBox);

    await waitFor(() => {
      expect((aliceBox as HTMLInputElement).checked).toBe(true);
    });
    expect(setSpy).toHaveBeenCalledWith("p1", true);
  });

  it("reverts when api.setPersonPaid rejects", async () => {
    vi.spyOn(api, "setPersonPaid").mockRejectedValue(new Error("boom"));
    renderView();

    const aliceBox = await screen.findByRole("checkbox", { name: /Mark Alice paid/ });
    fireEvent.click(aliceBox);

    await waitFor(() => {
      expect((aliceBox as HTMLInputElement).checked).toBe(false);
    });
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});

describe("TransactionView date display", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows the transaction date", async () => {
    const full: FullTransaction = {
      ...sampleFull(),
      transaction: { ...sampleFull().transaction, date: "2026-07-15" },
    };
    vi.spyOn(api, "getTransaction").mockResolvedValue(full);
    renderView();
    expect(await screen.findByText(/2026/)).toBeTruthy();
    expect(screen.getByText(/15/)).toBeTruthy();
  });
});

describe("TransactionView share caveat", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  // This Copy button predates share links, so its behaviour changed under
  // existing users. The caveat has to be visible where the choice is made.
  it("warns next to Copy that the link is public and unrevocable", async () => {
    vi.spyOn(api, "getTransaction").mockResolvedValue(sampleFull());
    renderView();
    const warning = await screen.findByText(/anyone can open/i);
    expect(warning.textContent).toMatch(/can'?t be revoked/i);
  });
});
