import { X } from "lucide-react";
import type { ScanStage } from "@/lib/types";

interface Props {
  stage: ScanStage;
  onRemove: () => void;
}

const SIZE = 32;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STAGE_FRACTION: Record<ScanStage, number> = {
  prepare: 0.25,
  anthropic: 0.75,
  finalize: 1,
};

export function ScanProgressRing({ stage, onRemove }: Props) {
  const offset = CIRCUMFERENCE * (1 - STAGE_FRACTION[stage]);
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label="Remove receipt"
      className="relative inline-flex items-center justify-center"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted"
        />
        <circle
          data-testid="scan-progress-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE.toFixed(3)}
          strokeDashoffset={offset.toFixed(3)}
          className="stroke-primary transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      <X className="size-3.5 relative" />
    </button>
  );
}
