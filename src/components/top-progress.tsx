"use client";

/**
 * TopProgressBar — Linear-style route progress indicator.
 *
 * Thin 2px bar at the top of the viewport that shows during route transitions.
 * Uses framer-motion for the animation and Next's router events via the
 * pathname hook (App Router pattern).
 */

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

export function TopProgressBar() {
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(false);
  const prevPathname = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Skip the first render (initial page load shows it via middleware)
    if (prevPathname.current === null) {
      prevPathname.current = pathname;
      return;
    }
    if (pathname === prevPathname.current) return;

    prevPathname.current = pathname;
    setVisible(true);
    const timeout = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          style={{ willChange: "opacity" }}
        >
          <div className="relative h-full w-full">
            {/* Transform-only bar — 60fps on any device */}
            <div
              className="absolute inset-y-0 left-0 w-1/2 animate-top-bar-indeterminate bg-foreground origin-left"
              style={{ willChange: "transform" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
