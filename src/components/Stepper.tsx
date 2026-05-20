import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface Props {
  steps: string[];
  current: number; // 1-based
}

export function Stepper({ steps, current }: Props) {
  return (
    <nav aria-label="Progress" className="flex items-center py-2 pb-6">
      {steps.map((label, i) => {
        const n = i + 1;
        const state =
          n < current ? "done" :
          n === current ? "current" : "upcoming";
        return (
          <Fragment key={label}>
            <div
              className="flex min-w-[80px] flex-col items-center gap-1.5"
              aria-current={state === "current" ? "step" : undefined}
            >
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/30",
                  state === "upcoming" && "border-border bg-background text-muted-foreground",
                )}
              >
                {n}
              </div>
              <span
                className={cn(
                  "text-[13px]",
                  state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  state === "current" && "font-semibold",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-1 mb-[22px] h-0.5 flex-1",
                  n < current ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
