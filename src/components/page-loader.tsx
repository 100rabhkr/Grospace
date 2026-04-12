"use client";

import { motion } from "framer-motion";
import { Logo } from "@/components/logo";

/**
 * PageLoader — prominent full-page loader with brand mark.
 *
 * Use this when a whole route is loading (not inline placeholders).
 * 60fps-safe: only transform + opacity animations.
 *
 *   <PageLoader />                 full page centered
 *   <PageLoader label="Loading…" /> with label
 *   <PageLoader size="sm" />        compact inline variant
 */

interface PageLoaderProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PageLoader({ label, size = "lg", className }: PageLoaderProps) {
  const ringClass = size === "sm" ? "w-12 h-12" : size === "md" ? "w-16 h-16" : "w-24 h-24";
  const tileClass = size === "sm" ? "w-9 h-9" : size === "md" ? "w-12 h-12" : "w-14 h-14";
  const logoClass = size === "sm" ? "w-4 h-4" : size === "md" ? "w-6 h-6" : "w-7 h-7";

  return (
    <div className={`flex min-h-[300px] h-full w-full items-center justify-center ${className || ""}`}>
      <div className="flex flex-col items-center gap-4">
        <div className={`relative ${ringClass}`}>
          {/* Outer pulsing ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-foreground/15"
            initial={{ scale: 0.85, opacity: 0.6 }}
            animate={{ scale: [0.85, 1.05, 0.85], opacity: [0.6, 0.12, 0.6] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
            style={{ willChange: "transform, opacity" }}
          />
          {/* Inner spinning ring */}
          <motion.div
            className="absolute inset-[6px] rounded-full border-2 border-foreground/10 border-t-foreground"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
            style={{ willChange: "transform" }}
          />
          {/* Center logo */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className={`flex items-center justify-center rounded-xl bg-foreground text-background ${tileClass}`}
              animate={{ scale: [1, 0.94, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
              style={{ willChange: "transform" }}
            >
              <Logo className={logoClass} />
            </motion.div>
          </div>
        </div>
        {label && (
          <motion.p
            className="text-[12px] font-medium text-muted-foreground tracking-tight"
            animate={{ opacity: [1, 0.45, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            style={{ willChange: "opacity" }}
          >
            {label}
          </motion.p>
        )}
      </div>
    </div>
  );
}
