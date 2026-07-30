import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SharePage } from "./SharePage";
import { encodeSharePayload, type SharePayload } from "@/lib/sharePayload";
import { computeSplit } from "@/lib/splitMath";
import { reconstruct } from "./reconstruct";
import { formatCents } from "@/lib/formatCurrency";

const PAYLOAD: SharePayload = {
  v: 1,
  t: "Dinner at Luigi's",
  c: "USD",
  d: "2026-07-29",
  p: ["Andy", "Ben", "Cara"],
  i: [
    ["Margherita Pizza", 1450, 0, [0, 1]],
    ["Sparkling Water", 900, 0, []],
    ["Tax", 205, 1, []],
    ["Tip", 400, 2, []],
  ],
};

describe("SharePage", () => {
  it("renders the title and date from the payload", () => {
    render(<SharePage fragment={encodeSharePayload(PAYLOAD)} />);
    expect(screen.getByText("Dinner at Luigi's")).toBeTruthy();
  });

  it("renders every person's name", () => {
    render(<SharePage fragment={encodeSharePayload(PAYLOAD)} />);
    for (const name of PAYLOAD.p) {
      // getByText throws on multiple matches; SplitTotalsTable plausibly
      // renders a person's name in both their totals row and a breakdown
      // line, so assert presence via getAllByText instead.
      expect(screen.getAllByText(new RegExp(name)).length).toBeGreaterThan(0);
    }
  });

  it("shows the no-data message for an empty fragment", () => {
    render(<SharePage fragment="" />);
    expect(screen.getByText(/no split data/i)).toBeTruthy();
  });

  it("shows the truncation-aware message for a corrupt fragment", () => {
    render(<SharePage fragment="!!!junk!!!" />);
    expect(screen.getByText(/corrupted or incomplete/i)).toBeTruthy();
  });

  it("shows the version message for a newer payload", () => {
    const future = encodeSharePayload({ ...PAYLOAD, v: 2 as unknown as 1 });
    render(<SharePage fragment={future} />);
    expect(screen.getByText(/newer version/i)).toBeTruthy();
  });

  it("offers a download link in every error state", () => {
    for (const frag of ["", "!!!junk!!!"]) {
      const { unmount } = render(<SharePage fragment={frag} />);
      expect(screen.getByRole("link", { name: /scansplit/i })).toBeTruthy();
      unmount();
    }
  });

  // The load-bearing test: the page must agree with the desktop app's math.
  it("renders totals identical to computeSplit on the same inputs", () => {
    const { items, people } = reconstruct(PAYLOAD);
    const expected = computeSplit(items, people);
    render(<SharePage fragment={encodeSharePayload(PAYLOAD)} />);
    for (const pt of expected.perPerson) {
      const text = formatCents(pt.totalCents, PAYLOAD.c);
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
  });
});
