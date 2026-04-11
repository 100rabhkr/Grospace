import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — three elevation tiers:
 *
 *   <Card>              default: hairline border, no shadow (flat surface)
 *   <Card variant="raised">    subtle shadow-sm elevation
 *   <Card variant="interactive"> hover-lifting card (use for clickable cards)
 *
 * Monochrome. No translucency. No glass.
 */

type CardVariant = "flat" | "default" | "elevated" | "interactive";

const variantClasses: Record<CardVariant, string> = {
  // Tertiary zone — no border, no shadow, just whitespace/bg
  flat: "bg-card",
  // Level 1 — hairline border, no shadow (the default for most cards)
  default: "border border-border bg-card",
  // Level 2 — hero card (shadow-md) — use sparingly
  elevated: "border border-border bg-card elevation-2",
  // Interactive hover-lift
  interactive:
    "border border-border bg-card elevation-1 transition-all duration-base ease-out-quint hover:-translate-y-0.5 hover:elevation-2 hover:border-border-strong cursor-pointer",
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-xl text-card-foreground", variantClasses[variant], className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1 p-5", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-h4 text-foreground tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-caption text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
