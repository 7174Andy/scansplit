import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ReceiptViewerDialog } from "./ReceiptViewerDialog";
import type { ReceiptRecord } from "@/lib/types";

vi.mock("@/lib/tauri", () => ({
  api: {
    getReceiptImage: vi.fn(),
  },
}));

import { api } from "@/lib/tauri";

const receipts: ReceiptRecord[] = [
  { id: "r1", transactionId: "t1", imagePath: "first.jpg", position: 0, scannedAt: 0 },
  { id: "r2", transactionId: "t1", imagePath: "second.jpg", position: 1, scannedAt: 0 },
];

beforeEach(() => {
  vi.mocked(api.getReceiptImage).mockReset();
});

describe("ReceiptViewerDialog", () => {
  it("renders image with data url after fetch", async () => {
    vi.mocked(api.getReceiptImage).mockResolvedValue({
      mime: "image/jpeg",
      bytesBase64: "AAAA",
      byteSize: 3,
    });
    render(
      <ReceiptViewerDialog
        receipts={receipts}
        initialIndex={0}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => {
      const img = screen.getByRole("img", { name: /first\.jpg/i });
      expect((img as HTMLImageElement).src).toBe("data:image/jpeg;base64,AAAA");
    });
  });

  it("cycles to the next receipt and fetches its image", async () => {
    vi.mocked(api.getReceiptImage)
      .mockResolvedValueOnce({ mime: "image/jpeg", bytesBase64: "AAAA", byteSize: 3 })
      .mockResolvedValueOnce({ mime: "image/jpeg", bytesBase64: "BBBB", byteSize: 3 });
    render(
      <ReceiptViewerDialog
        receipts={receipts}
        initialIndex={0}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => screen.getByRole("img", { name: /first\.jpg/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      const img = screen.getByRole("img", { name: /second\.jpg/i });
      expect((img as HTMLImageElement).src).toBe("data:image/jpeg;base64,BBBB");
    });
    expect(api.getReceiptImage).toHaveBeenCalledTimes(2);
  });

  it("shows unavailable message when bytes are empty", async () => {
    vi.mocked(api.getReceiptImage).mockResolvedValue({
      mime: "image/jpeg",
      bytesBase64: "",
      byteSize: 0,
    });
    render(
      <ReceiptViewerDialog
        receipts={[receipts[0]]}
        initialIndex={0}
        open={true}
        onOpenChange={() => {}}
      />,
    );
    await waitFor(() => {
      const el = screen.getByText(/image no longer available/i);
      expect(el).toBeTruthy();
    });
  });
});
