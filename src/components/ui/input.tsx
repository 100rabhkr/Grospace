import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input — minimal monochrome text field.
 * Hairline border, soft focus ring. No glass, no shadows.
 */

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-background px-3 py-1.5",
          "text-[13px] font-medium text-foreground placeholder:text-muted-foreground",
          "transition-colors duration-fast",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:border-foreground/60",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
