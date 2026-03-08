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

/** Color scheme: past = green, current/active = blue, upcoming = amber, warning (expiring soon) = red-orange */
const dotBgClasses: Record<string, string> = {
  past: "bg-emerald-500",
  current: "bg-blue-500",
  future: "bg-amber-500",
  warning: "bg-red-500",
};

const labelClasses: Record<string, string> = {
  past: "text-emerald-700",
  current: "text-blue-700 font-semibold",
  future: "text-amber-700",
  warning: "text-red-600 font-semibold",
};

const segmentColors: Record<string, string> = {
  past: "#bbf7d0",      // green-200
  current: "#bfdbfe",   // blue-200
  future: "#fde68a",    // amber-200
  warning: "#fecaca",   // red-200
};

export default function AgreementTimeline({ dates }: AgreementTimelineProps) {
  if (!dates || dates.length === 0) return null;

  // Sort dates chronologically
  const sorted = [...dates].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const now = Date.now();
  const minTime = new Date(sorted[0].date).getTime();
  const maxTime = new Date(sorted[sorted.length - 1].date).getTime();
  const range = maxTime - minTime || 1;

  // Add padding so edge dots aren't cut off
  const PAD = 4; // percent padding on each side
  const usableWidth = 100 - PAD * 2;

  function toPct(time: number): number {
    return PAD + ((time - minTime) / range) * usableWidth;
  }

  // Position of "today" marker as percentage
  const todayPct = toPct(Math.max(minTime, Math.min(maxTime, now)));
  const todayVisible = now >= minTime && now <= maxTime;

  // Build colored segments between consecutive dates
  const segments: { left: number; width: number; color: string }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const startTime = new Date(sorted[i].date).getTime();
    const endTime = new Date(sorted[i + 1].date).getTime();
    // Classify segment based on whether it's before, after, or spanning "now"
    let segType: string;
    if (endTime < now) {
      segType = "past";
    } else if (startTime > now) {
      // future segment - check if it's in warning zone
      const warningThreshold = now + 90 * 24 * 60 * 60 * 1000;
      segType = startTime <= warningThreshold ? "warning" : "future";
    } else {
      segType = "current"; // spans "now"
    }

    const left = toPct(startTime);
    const right = toPct(endTime);
    segments.push({
      left,
      width: right - left,
      color: segmentColors[segType] || segmentColors.future,
    });
  }

  // Reclassify dates using our green/blue/amber scheme
  const reclassified = sorted.map((item) => {
    const warningThreshold = now + 90 * 24 * 60 * 60 * 1000;
    const t = new Date(item.date).getTime();
    let type: "past" | "current" | "future" | "warning";
    if (t < now) type = "past";
    else if (t <= warningThreshold) type = "warning";
    else type = "future";
    return { ...item, type };
  });

  // For label positioning: alternate top/bottom to avoid overlap, but also
  // check if adjacent markers are too close and shift accordingly
  const positions = reclassified.map((item, i) => {
    const pct = toPct(new Date(item.date).getTime());
    // Default: alternate above/below
    const isAbove = i % 2 === 0;
    return { ...item, pct, isAbove };
  });

  const legendItems = [
    { color: "bg-emerald-500", label: "Past" },
    { color: "bg-blue-500", label: "Current" },
    { color: "bg-amber-500", label: "Upcoming" },
    { color: "bg-red-500", label: "Expiring Soon" },
  ];

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${item.color}`} />
            <span className="text-[10px] text-neutral-500">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-black/60 rounded" />
          <span className="text-[10px] text-neutral-500">Today</span>
        </div>
      </div>

      {/* Timeline visualization */}
      <div className="relative" style={{ minHeight: "100px" }}>
        {/* Background track */}
        <div
          className="absolute h-2 bg-neutral-100 rounded-full"
          style={{ top: "42px", left: `${PAD}%`, right: `${PAD}%` }}
        />

        {/* Colored segments */}
        {segments.map((seg, i) => (
          <div
            key={i}
            className="absolute h-2 rounded-full"
            style={{
              top: "42px",
              left: `${seg.left}%`,
              width: `${seg.width}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}

        {/* Filled progress bar (solid color up to today) */}
        {todayVisible && (
          <div
            className="absolute h-2 rounded-full"
            style={{
              top: "42px",
              left: `${PAD}%`,
              width: `${todayPct - PAD}%`,
              background: "linear-gradient(90deg, #86efac 0%, #22c55e 60%, #3b82f6 100%)",
              opacity: 0.5,
            }}
          />
        )}

        {/* Today marker */}
        {todayVisible && (
          <div
            className="absolute flex flex-col items-center"
            style={{ left: `${todayPct}%`, transform: "translateX(-50%)", top: "30px", zIndex: 20 }}
          >
            <div
              className="relative"
              style={{ width: "2px", height: "24px", backgroundColor: "rgba(0,0,0,0.6)" }}
            >
              {/* Triangle pointer */}
              <div
                style={{
                  position: "absolute",
                  top: "-5px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "5px solid rgba(0,0,0,0.6)",
                }}
              />
            </div>
            <span
              className="text-[9px] font-semibold text-neutral-600 mt-0.5 whitespace-nowrap"
              style={{ letterSpacing: "0.05em" }}
            >
              TODAY
            </span>
          </div>
        )}

        {/* Date markers */}
        {positions.map((item) => {
          const dotColor = dotBgClasses[item.type] || dotBgClasses.future;
          const textColor = labelClasses[item.type] || labelClasses.future;

          return (
            <div
              key={`${item.label}-${item.date}`}
              className="absolute flex flex-col items-center"
              style={{
                left: `${item.pct}%`,
                transform: "translateX(-50%)",
                top: item.isAbove ? "0px" : "38px",
                zIndex: 10,
              }}
            >
              {item.isAbove ? (
                <>
                  {/* Label above */}
                  <div className="text-center mb-1">
                    <p className={`text-[10px] leading-tight whitespace-nowrap ${textColor}`}>
                      {item.label}
                    </p>
                    <p className="text-[9px] text-neutral-400 whitespace-nowrap">
                      {formatTimelineDate(item.date)}
                    </p>
                  </div>
                  {/* Connector line */}
                  <div className="w-px h-2 bg-neutral-300" />
                  {/* Dot */}
                  <div
                    className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${dotColor} flex-shrink-0`}
                  />
                </>
              ) : (
                <>
                  {/* Dot */}
                  <div
                    className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${dotColor} flex-shrink-0`}
                  />
                  {/* Connector line */}
                  <div className="w-px h-2 bg-neutral-300" />
                  {/* Label below */}
                  <div className="text-center mt-1">
                    <p className={`text-[10px] leading-tight whitespace-nowrap ${textColor}`}>
                      {item.label}
                    </p>
                    <p className="text-[9px] text-neutral-400 whitespace-nowrap">
                      {formatTimelineDate(item.date)}
                    </p>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
