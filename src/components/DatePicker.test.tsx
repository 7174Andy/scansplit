import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DatePicker } from "./DatePicker";

describe("DatePicker", () => {
  afterEach(() => cleanup());

  it("shows the formatted value on the trigger", () => {
    render(<DatePicker value="2026-07-15" onChange={() => {}} />);
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toMatch(/2026/);
    expect(trigger.textContent).toMatch(/15/);
  });

  it("calls onChange with YYYY-MM-DD when a day is picked", async () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-07-15" onChange={onChange} />);
    // before opening, the trigger is the only button
    fireEvent.click(screen.getByRole("button"));
    // the calendar renders day <button>s; find and click July 20
    const day = await screen.findByText(
      (content, el) => el?.tagName === "BUTTON" && content.trim() === "20"
    );
    fireEvent.click(day);
    expect(onChange).toHaveBeenCalledWith("2026-07-20");
  });
});
