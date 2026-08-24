import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  showPercentage?: boolean;
  xpBar?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const barSizes = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
} as const;

const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      max = 100,
      showPercentage = false,
      xpBar = false,
      size = "md",
      label,
      className,
      ...props
    },
    ref,
  ) => {
    const clamped = Math.max(0, Math.min(value, max));
    const percentage = max > 0 ? Math.round((clamped / max) * 100) : 0;

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {(label || showPercentage) && (
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            {label && <span>{label}</span>}
            {showPercentage && <span className="font-medium tabular-nums">{percentage}%</span>}
          </div>
        )}
        <div
          className={cn(
            "w-full overflow-hidden rounded-full bg-muted",
            barSizes[size],
          )}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              xpBar ? "xp-bar" : "bg-primary",
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  },
);

ProgressBar.displayName = "ProgressBar";

export { ProgressBar };
