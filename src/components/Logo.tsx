import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ScanSplit logo"
      className={cn("text-amber-500", className)}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M 14 12 Q 14 8 18 8 L 46 8 Q 50 8 50 12 L 50 48 L 48 54 L 46 48 L 44 54 L 42 48 L 40 54 L 38 48 L 36 54 L 34 48 L 32 54 L 30 48 L 28 54 L 26 48 L 24 54 L 22 48 L 20 54 L 18 48 L 16 54 L 14 48 Z M 19 20 L 45 20 L 45 22 L 19 22 Z M 19 28 L 39 28 L 39 30 L 19 30 Z M 19 36 L 45 36 L 45 38 L 19 38 Z"
      />
    </svg>
  );
}
