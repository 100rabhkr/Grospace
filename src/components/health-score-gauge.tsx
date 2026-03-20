"use client";

interface HealthScoreGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const sizeConfig = {
  sm: { width: 64, stroke: 5, fontSize: "text-sm", labelSize: "text-[9px]" },
  md: { width: 96, stroke: 6, fontSize: "text-xl", labelSize: "text-[10px]" },
  lg: { width: 128, stroke: 8, fontSize: "text-2xl", labelSize: "text-xs" },
};

function getScoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 70) return "Healthy";
  if (score >= 40) return "At Risk";
  return "Critical";
}

export function HealthScoreGauge({
  score,
  size = "md",
  showLabel = true,
}: HealthScoreGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const config = sizeConfig[size];
  const radius = (config.width - config.stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  // Arc goes from 75% around (270 degrees) — leave a gap at the bottom
  const arcLength = circumference * 0.75;
  const filledLength = (clampedScore / 100) * arcLength;
  const dashArray = `${filledLength} ${circumference}`;
  const color = getScoreColor(clampedScore);
  const center = config.width / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: config.width, height: config.width }}>
        <svg
          width={config.width}
          height={config.width}
          viewBox={`0 0 ${config.width} ${config.width}`}
          className="transform rotate-[135deg]"
        >
          {/* Background arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#e4e8ef"
            strokeWidth={config.stroke}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Filled arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={config.stroke}
            strokeDasharray={dashArray}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        {/* Score text in center */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${config.fontSize} font-bold text-[#132337] leading-none`}>
            {clampedScore}
          </span>
          <span
            className="text-[9px] font-medium mt-0.5 leading-none"
            style={{ color }}
          >
            {getScoreLabel(clampedScore)}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className={`${config.labelSize} font-medium text-neutral-500`}>
          Lease Health
        </span>
      )}
    </div>
  );
}
