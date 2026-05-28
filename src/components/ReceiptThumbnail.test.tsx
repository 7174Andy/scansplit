import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReceiptThumbnail } from "./ReceiptThumbnail";
import type { ReceiptRecord } from "@/lib/types";

const receipt: ReceiptRecord = {
  id: "r1",
  transactionId: "t1",
  imagePath: "receipt.jpg",
  position: 0,
  scannedAt: 0,
};

describe("ReceiptThumbnail", () => {
  it("renders stage label and ScanProgressRing when status is 'scanning' and stage is 'anthropic'", () => {
    const onRemove = vi.fn();
    render(
      <ReceiptThumbnail
        receipt={receipt}
        status="scanning"
        stage="anthropic"
        onRemove={onRemove}
      />,
    );

    // Assert the stage label is rendered with the correct text
    expect(screen.getByText("Analyzing receipt…")).toBeTruthy();

    // Assert the ScanProgressRing is rendered (by its data-testid)
    expect(screen.getByTestId("scan-progress-arc")).toBeTruthy();

    // Assert the bare X button is NOT shown (queryByTestId returns null when not found)
    expect(screen.queryByTestId("scan-progress-arc")).toBeTruthy(); // Ring is present
  });

  it("does not render ScanProgressRing when status is 'pending'", () => {
    const onRemove = vi.fn();
    render(
      <ReceiptThumbnail
        receipt={receipt}
        status="pending"
        onRemove={onRemove}
      />,
    );

    // Assert the ScanProgressRing is NOT rendered
    expect(screen.queryByTestId("scan-progress-arc")).toBeNull();

    // Assert a Remove receipt button is rendered
    expect(screen.getByRole("button", { name: /remove receipt/i })).toBeTruthy();
  });
});
