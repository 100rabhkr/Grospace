"use client";

/**
 * Motion primitives — the entire platform's animation vocabulary lives here.
 * Use these instead of ad-hoc framer-motion props so the feel stays consistent.
 *
 *   <PageTransition>    Page root wrapper (fade + 6px lift, 0.25s spring)
 *   <FadeUp>            One element (defaults to 0.22s spring, delay optional)
 *   <Stagger>           Parent that cascades children by 40ms
 *   <Counter>           Smoothly counts a number up on mount
 */

import * as React from "react";
import { motion, useMotionValue, useTransform, animate, type Transition, type Variants } from "framer-motion";

const SPRING: Transition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
};

const QUICK: Transition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1],
};

/* ────────────────────────────────────────────────
 * PageTransition — wrap route content
 * ──────────────────────────────────────────────── */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────
 * FadeUp — single element entrance
 * ──────────────────────────────────────────────── */
export function FadeUp({
  children,
  delay = 0,
  className,
  as: Component = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "article" | "header";
}) {
  const MotionComponent = motion[Component] as typeof motion.div;
  return (
    <MotionComponent
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...QUICK, delay }}
    >
      {children}
    </MotionComponent>
  );
}

/* ────────────────────────────────────────────────
 * Stagger — cascades children with layout-safe delay
 * Usage: <Stagger><FadeItem />...</Stagger>
 * ──────────────────────────────────────────────── */
const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  },
};

export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={staggerItemVariants}>
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────
 * Counter — smoothly counts a number up on mount
 * Used by KPI cards / dashboard metrics.
 *
 *  <Counter value={428} format={(v) => Math.round(v).toLocaleString()} />
 * ──────────────────────────────────────────────── */
export function Counter({
  value,
  duration = 0.9,
  format = (v) => Math.round(v).toString(),
  className,
}: {
  value: number;
  duration?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (latest) => format(latest));

  React.useEffect(() => {
    const controls = animate(mv, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [mv, value, duration]);

  return <motion.span className={className}>{display}</motion.span>;
}

/* ────────────────────────────────────────────────
 * HoverLift — subtle hover lift for cards
 * Use as wrapper: <HoverLift>...</HoverLift>
 * ──────────────────────────────────────────────── */
export function HoverLift({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      className={className}
      onClick={onClick}
      whileHover={{ y: -2, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
      whileTap={{ y: 0, scale: 0.99, transition: { duration: 0.12 } }}
    >
      {children}
    </motion.div>
  );
}
