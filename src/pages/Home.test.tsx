import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Home from "./Home";
import { api } from "@/lib/tauri";

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe("Home paid indicator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("shows 'Settled' when paidCount equals peopleCount", async () => {
    vi.spyOn(api, "listTransactions").mockResolvedValue([
      {
        id: "t1", title: "Dinner", currency: "USD", updatedAt: 0, date: "2026-01-01",
        peopleCount: 3, paidCount: 3, totalCents: 9000,
      },
    ]);
    renderHome();
    expect(await screen.findByText("Settled")).toBeTruthy();
  });

  it("shows 'X of N paid' when partial", async () => {
    vi.spyOn(api, "listTransactions").mockResolvedValue([
      {
        id: "t2", title: "Lunch", currency: "USD", updatedAt: 0, date: "2026-01-01",
        peopleCount: 3, paidCount: 1, totalCents: 4000,
      },
    ]);
    renderHome();
    expect(await screen.findByText("1 of 3 paid")).toBeTruthy();
  });

  it("shows nothing when peopleCount is zero", async () => {
    vi.spyOn(api, "listTransactions").mockResolvedValue([
      {
        id: "t3", title: "Empty", currency: "USD", updatedAt: 0, date: "2026-01-01",
        peopleCount: 0, paidCount: 0, totalCents: 0,
      },
    ]);
    renderHome();
    expect(await screen.findByText("Empty")).toBeTruthy();
    expect(screen.queryByText(/paid/)).toBeNull();
    expect(screen.queryByText("Settled")).toBeNull();
  });
});
