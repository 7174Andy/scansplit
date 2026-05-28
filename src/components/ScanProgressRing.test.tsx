import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScanProgressRing } from "./ScanProgressRing";

const SIZE = 32;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function offsetFor(fraction: number): string {
  return (CIRCUMFERENCE * (1 - fraction)).toFixed(3);
}

describe("ScanProgressRing", () => {
  it("renders the foreground arc at 25% fill for stage 'prepare'", () => {
    render(<ScanProgressRing stage="prepare" onRemove={() => {}} />);
    const arc = screen.getByTestId("scan-progress-arc");
    expect(arc.getAttribute("stroke-dashoffset")).toBe(offsetFor(0.25));
  });

  it("renders the foreground arc at 75% fill for stage 'anthropic'", () => {
    render(<ScanProgressRing stage="anthropic" onRemove={() => {}} />);
    const arc = screen.getByTestId("scan-progress-arc");
    expect(arc.getAttribute("stroke-dashoffset")).toBe(offsetFor(0.75));
  });

  it("renders the foreground arc at 100% fill for stage 'finalize'", () => {
    render(<ScanProgressRing stage="finalize" onRemove={() => {}} />);
    const arc = screen.getByTestId("scan-progress-arc");
    expect(arc.getAttribute("stroke-dashoffset")).toBe(offsetFor(1));
  });

  it("clicking the X calls onRemove", () => {
    const onRemove = vi.fn();
    render(<ScanProgressRing stage="prepare" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /remove receipt/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
