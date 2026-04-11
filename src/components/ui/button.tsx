import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — monochrome-first with strict press feedback.
 *
 * Variants:
 *   default       Primary ink button (black on white)
 *   secondary     Soft gray surface
 *   outline       Hairline border, transparent bg
 *   ghost         No border, hover bg only
 *   link          Inline text link
 *   destructive   Red (used ONLY for destructive actions)
 *
 * Every variant has a 97% press scale via active:scale-[0.97] for tactile feel.
 */

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-[13px] font-semibold tracking-tight",
    "transition-all duration-fast ease-out-quint",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.97]",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background hover:bg-foreground/90 elevation-1",
        secondary:
          "bg-muted text-foreground hover:bg-muted/80 border border-border",
        outline:
          "border border-border bg-background text-foreground hover:bg-muted hover:border-border-strong",
        ghost:
          "text-foreground hover:bg-muted",
        link:
          "text-foreground underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 elevation-1",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[12px]",
        lg: "h-10 px-5 text-[14px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
