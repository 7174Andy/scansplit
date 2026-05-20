import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConfidenceDot } from "./ConfidenceDot";

describe("ConfidenceDot", () => {
  it("renders green for high", () => {
    const { container } = render(<ConfidenceDot confidence="high" />);
    expect(container.querySelector("span")?.className).toContain("bg-emerald-500");
  });

  it("renders amber for medium", () => {
    const { container } = render(<ConfidenceDot confidence="medium" />);
    expect(container.querySelector("span")?.className).toContain("bg-amber-500");
  });

  it("renders red for low and shows reasons in title", () => {
    const { container } = render(
      <ConfidenceDot confidence="low" reasons={["price missing"]} />
    );
    const span = container.querySelector("span")!;
    expect(span.className).toContain("bg-rose-500");
    expect(span.getAttribute("title")).toContain("price missing");
  });
});
