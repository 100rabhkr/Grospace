import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

/**
 * GroSpace stylized 'g' logomark — inherits `color` from currentColor.
 * Use `text-white` on dark backgrounds, `text-primary` on light.
 */
export function Logo({ className }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 150"
      fill="currentColor"
      className={cn("h-6 w-6", className)}
      aria-hidden="true"
    >
      <path d="M60 6C30 6 8 28 8 58s22 52 52 52c10 0 19-3 26-7v-7c0-4 3-5 5-3 1 1 3 3 4 4 2 2 5 1 5-2V58C100 28 90 6 60 6Zm0 84c-16 0-30-12-30-30s14-30 30-30 30 12 30 30-14 30-30 30Z" />
      <path d="M92 14c3-8 9-13 14-11 3 1 3 5 1 9l-8 16c-2 3-5 4-7 2l-3-3c-2-2-1-6 3-13Z" />
      <ellipse cx="62" cy="130" rx="30" ry="10" transform="rotate(-25 62 130)" />
    </svg>
  );
}
