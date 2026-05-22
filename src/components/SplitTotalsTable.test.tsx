import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SplitTotalsTable } from "./SplitTotalsTable";
import type { ShareLine, SplitResult } from "../lib/types";

const line = (
  o: Partial<ShareLine> & Pick<ShareLine, "itemId" | "itemKind">
): ShareLine => ({
  shareCents: 0,
  itemPriceCents: 0,
  sharerCount: 1,
  isEveryone: false,
  bumpedCents: 0,
  ...o,
});

function renderTable() {
  const split: SplitResult = {
    totalCents: 971,
    perPerson: [
      {
        personId: "p0",
        totalCents: 971,
        itemBreakdown: [
          line({
            itemId: "i1",
            shareCents: 600,
            itemKind: "item",
            itemPriceCents: 1200,
            sharerCount: 2,
          }),
          line({
            itemId: "tax",
            shareCents: 171,
            itemKind: "tax",
            itemPriceCents: 450,
            sharerCount: 2,
            isEveryone: true,
            weightBasisPoints: 3800,
          }),
          line({
            itemId: "tip",
            shareCents: 200,
            itemKind: "tip",
            itemPriceCents: 600,
            sharerCount: 3,
            isEveryone: true,
            bumpedCents: 1,
          }),
        ],
      },
    ],
  };
  const { container } = render(
    <SplitTotalsTable
      split={split}
      personNames={{ p0: "Alice" }}
      itemNames={{ i1: "Caesar Salad", tax: "Tax", tip: "Tip" }}
      currency="USD"
    />
  );
  // Open every <details> so its children are guaranteed visible regardless of
  // jsdom's handling of the collapsed state.
  container.querySelectorAll("details").forEach((d) => {
    (d as HTMLDetailsElement).open = true;
  });
}

describe("SplitTotalsTable paid status", () => {
  afterEach(() => cleanup());

  function renderWithPaid(opts: {
    paidByPersonId?: Record<string, number | null>;
    onTogglePaid?: (id: string, next: boolean) => void;
  }) {
    const split: SplitResult = {
      totalCents: 1000,
      perPerson: [
        {
          personId: "p1",
          totalCents: 500,
          itemBreakdown: [
            line({ itemId: "i1", shareCents: 500, itemKind: "item", itemPriceCents: 1000, sharerCount: 2 }),
          ],
        },
        {
          personId: "p2",
          totalCents: 500,
          itemBreakdown: [
            line({ itemId: "i1", shareCents: 500, itemKind: "item", itemPriceCents: 1000, sharerCount: 2 }),
          ],
        },
      ],
    };
    return render(
      <SplitTotalsTable
        split={split}
        personNames={{ p1: "Alice", p2: "Bob" }}
        itemNames={{ i1: "Pizza" }}
        currency="USD"
        paidByPersonId={opts.paidByPersonId}
        onTogglePaid={opts.onTogglePaid}
      />
    );
  }

  it("renders a checkbox per person when paidByPersonId is provided", () => {
    renderWithPaid({ paidByPersonId: { p1: null, p2: null } });
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBe(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(false);
  });

  it("checkbox reflects paid state via paidByPersonId", () => {
    renderWithPaid({ paidByPersonId: { p1: 1_700_000_000_000, p2: null } });
    const boxes = screen.getAllByRole("checkbox");
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it("clicking a checkbox invokes onTogglePaid with the next value", () => {
    const calls: Array<[string, boolean]> = [];
    renderWithPaid({
      paidByPersonId: { p1: null, p2: null },
      onTogglePaid: (id, next) => calls.push([id, next]),
    });
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    expect(calls).toEqual([["p1", true]]);
  });

  it("renders no checkbox when paidByPersonId is omitted (Step 5 fallback)", () => {
    renderWithPaid({});
    expect(screen.queryAllByRole("checkbox").length).toBe(0);
  });
});

describe("SplitTotalsTable", () => {
  afterEach(() => cleanup());

  it("renders formula lines for each share kind", () => {
    renderTable();
    expect(
      screen.getByText("Caesar Salad: $12.00 ÷ 2 = $6.00")
    ).not.toBeNull();
    expect(
      screen.getByText("Tax (proportional): $4.50 × 38% = $1.71")
    ).not.toBeNull();
    expect(
      screen.getByText("Tip (split evenly): $6.00 ÷ 3 = $2.00")
    ).not.toBeNull();
  });

  it("renders the rounding bump suffix when bumpedCents != 0", () => {
    renderTable();
    expect(screen.getByText("+1¢ rounding")).not.toBeNull();
  });
});
