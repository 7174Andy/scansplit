import type { ReceiptRecord } from "../lib/types";

interface Props {
  receipt: ReceiptRecord;
  status: "pending" | "scanning" | "ok" | "error";
  error?: string;
  onRemove: () => void;
  onRetry?: () => void;
}

export function ReceiptThumbnail({ receipt, status, error, onRemove, onRetry }: Props) {
  return (
    <div style={{
      width: 90, padding: 8, background: "#222", borderRadius: 6,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      border: status === "error" ? "1px solid #e07a7a" : "1px solid #333",
    }}>
      <div style={{ fontSize: 28 }}>🧾</div>
      <div style={{ fontSize: 10, color: "#888", textAlign: "center" }}>
        {receipt.imagePath.split("/").pop()}
      </div>
      {status === "scanning" && <div style={{ fontSize: 10 }}>scanning…</div>}
      {status === "ok" && <div style={{ fontSize: 10, color: "#6ec96e" }}>✓ done</div>}
      {status === "error" && (
        <div style={{ fontSize: 10, color: "#e07a7a", textAlign: "center" }}>
          {error}
          {onRetry && <div><button style={{ fontSize: 10 }} onClick={onRetry}>Retry</button></div>}
        </div>
      )}
      <button style={{ fontSize: 10 }} onClick={onRemove}>Remove</button>
    </div>
  );
}
