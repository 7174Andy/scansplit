import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TransactionView from "./TransactionView";
import { api } from "@/lib/tauri";
import type { FullTransaction } from "@/lib/types";

function sampleFull(): FullTransaction {
  return {
    transaction: { id: "t1", title: "Dinner", currency: "USD", createdAt: 0, updatedAt: 0 },
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
