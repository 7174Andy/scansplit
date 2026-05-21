import type { Confidence } from "@/lib/types";

const COLOR: Record<Confidence, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-rose-500",
};

const LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Needs review",
  low: "Likely incorrect",
};

export function ConfidenceDot({
  confidence,
  reasons,
}: {
  confidence: Confidence;
  reasons?: string[];
}) {
  const title = reasons && reasons.length > 0
    ? `${LABEL[confidence]}: ${reasons.join("; ")}`
    : LABEL[confidence];
  return (
    <span
      role="img"
      aria-label={LABEL[confidence]}
      title={title}
      className={`inline-block size-2 rounded-full ${COLOR[confidence]}`}
    />
  );
}
