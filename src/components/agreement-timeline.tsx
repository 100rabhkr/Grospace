"use client";

type TimelineDate = {
  label: string;
  date: string;
  type: "past" | "current" | "future" | "warning";
};

interface AgreementTimelineProps {
  dates: TimelineDate[];
}

function formatTimelineDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const dotColors: Record<TimelineDate["type"], string> = {
  past: "bg-neutral-400",
  current: "bg-black",
  future: "bg-blue-500",
  warning: "bg-amber-500",
};

const labelColors: Record<TimelineDate["type"], string> = {
  past: "text-neutral-400",
  current: "text-black font-semibold",
  future: "text-blue-600",
  warning: "text-amber-600 font-semibold",
};

export default function AgreementTimeline({ dates }: AgreementTimelineProps) {
  if (!dates || dates.length === 0) return null;

  // Sort dates chronologically
  const sorted = [...dates].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const now = new Date().getTime();
  const minTime = new Date(sorted[0].date).getTime();
  const maxTime = new Date(sorted[sorted.length - 1].date).getTime();
  const range = maxTime - minTime || 1;

  // Position of "today" marker as percentage
  const todayPct = Math.max(0, Math.min(100, ((now - minTime) / range) * 100));

  return (
    <div className="w-full py-2">
      {/* Timeline bar */}
      <div className="relative mx-4">
        {/* Base line */}
        <div className="absolute top-3 left-0 right-0 h-0.5 bg-neutral-200 rounded-full" />

        {/* Filled portion up to today */}
        <div
          className="absolute top-3 left-0 h-0.5 bg-neutral-400 rounded-full"
          style={{ width: `${todayPct}%` }}
        />

        {/* Today marker */}
        {todayPct > 0 && todayPct < 100 && (
          <div
            className="absolute top-0"
            style={{ left: `${todayPct}%`, transform: "translateX(-50%)" }}
          >
            <div className="w-0.5 h-6 bg-black/30 mx-auto" />
            <p className="text-[9px] text-neutral-400 mt-0.5 whitespace-nowrap text-center">
              Today
            </p>
          </div>
        )}

        {/* Date dots */}
        <div className="relative flex justify-between" style={{ minHeight: "80px" }}>
          {sorted.map((item, i) => {
            const pct = ((new Date(item.date).getTime() - minTime) / range) * 100;
            // Alternate labels above and below to avoid overlap
            const isAbove = i % 2 === 0;

            return (
              <div
                key={`${item.label}-${item.date}`}
                className="absolute flex flex-col items-center"
                style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
              >
                {isAbove && (
                  <div className="mb-1 text-center">
                    <p className={`text-[10px] leading-tight whitespace-nowrap ${labelColors[item.type]}`}>
                      {item.label}
                    </p>
                    <p className="text-[9px] text-neutral-400 whitespace-nowrap">
                      {formatTimelineDate(item.date)}
                    </p>
                  </div>
                )}

                {/* Dot */}
                <div
                  className={`w-2.5 h-2.5 rounded-full border-2 border-white ring-1 ring-neutral-200 ${dotColors[item.type]} flex-shrink-0`}
                />

                {!isAbove && (
                  <div className="mt-1 text-center">
                    <p className={`text-[10px] leading-tight whitespace-nowrap ${labelColors[item.type]}`}>
                      {item.label}
                    </p>
                    <p className="text-[9px] text-neutral-400 whitespace-nowrap">
                      {formatTimelineDate(item.date)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
