"use client";

import { useState, useMemo, useCallback, memo, useRef } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { Plus, Minus } from "lucide-react";
import Link from "next/link";

const INDIA_GEO_URL =
  "https://gist.githubusercontent.com/jbrobst/56c13bbbf9d97d187fea01ca62ea5112/raw/e388c4cae20aa53cb5090210a42ebb9b765c0a36/india_states.geojson";

const CITY_COORDS: Record<string, [number, number]> = {
  mumbai: [72.8777, 19.076],
  delhi: [77.1025, 28.7041],
  "new delhi": [77.209, 28.6139],
  bangalore: [77.5946, 12.9716],
  bengaluru: [77.5946, 12.9716],
  hyderabad: [78.4867, 17.385],
  chennai: [80.2707, 13.0827],
  kolkata: [88.3639, 22.5726],
  pune: [73.8567, 18.5204],
  ahmedabad: [72.5714, 23.0225],
  jaipur: [75.7873, 26.9124],
  lucknow: [80.9462, 26.8467],
  chandigarh: [76.7794, 30.7333],
  gurugram: [77.0266, 28.4595],
  gurgaon: [77.0266, 28.4595],
  noida: [77.391, 28.5355],
  "greater noida": [77.4538, 28.4744],
  ghaziabad: [77.4538, 28.6692],
  faridabad: [77.3178, 28.4089],
  "nehru place": [77.2507, 28.5494],
  indore: [75.8577, 22.7196],
  bhopal: [77.4126, 23.2599],
  nagpur: [79.0882, 21.1458],
  surat: [72.8311, 21.1702],
  vadodara: [73.1812, 22.3072],
  kochi: [76.2671, 9.9312],
  thiruvananthapuram: [76.9366, 8.5241],
  coimbatore: [76.9558, 11.0168],
  visakhapatnam: [83.2185, 17.6868],
  vizag: [83.2185, 17.6868],
  patna: [85.1376, 25.6093],
  ranchi: [85.3096, 23.3441],
  bhubaneswar: [85.8245, 20.2961],
  dehradun: [78.0322, 30.3165],
  shimla: [77.1734, 31.1048],
  jammu: [74.857, 32.7266],
  amritsar: [74.8723, 31.634],
  ludhiana: [75.8573, 30.901],
  agra: [78.0081, 27.1767],
  varanasi: [83.0007, 25.3176],
  kanpur: [80.3319, 26.4499],
  mysore: [76.6394, 12.2958],
  mysuru: [76.6394, 12.2958],
  mangalore: [74.856, 12.9141],
  mangaluru: [74.856, 12.9141],
  goa: [73.8278, 15.4909],
  panaji: [73.8278, 15.4909],
  raipur: [81.6296, 21.2514],
  guwahati: [91.7362, 26.1445],
  imphal: [93.9368, 24.817],
  shillong: [91.8933, 25.5788],
  gangtok: [88.6138, 27.3389],
  itanagar: [93.6166, 27.0844],
  kohima: [94.1086, 25.6751],
  aizawl: [92.7176, 23.7271],
  agartala: [91.2868, 23.8315],
  pondicherry: [79.8083, 11.9416],
  puducherry: [79.8083, 11.9416],
  udaipur: [73.7125, 24.5854],
  jodhpur: [73.0243, 26.2389],
  rajkot: [70.8022, 22.3039],
  madurai: [78.1198, 9.9252],
  tiruchirappalli: [78.6569, 10.7905],
  trichy: [78.6569, 10.7905],
  thane: [72.9781, 19.2183],
  "navi mumbai": [73.0169, 19.0368],
};

export interface OutletInfo {
  id?: string;
  name: string;
  status: string;
  rent?: number;
}

export interface ClusterData {
  cities: string[];
  label: string;
  count: number;
  coords: [number, number];
  outlets: OutletInfo[];
}

interface IndiaMapProps {
  outletsByCity: Record<string, number>;
  outletDetails?: Record<string, OutletInfo[]>;
  selectedCluster?: string | null;
  onSelectCluster?: (cluster: ClusterData | null) => void;
}

function clusterMarkers(
  entries: { city: string; count: number; coords: [number, number]; outlets: OutletInfo[] }[]
): ClusterData[] {
  const THRESHOLD = 0.5;
  const clusters: ClusterData[] = [];
  const used = new Set<number>();
  const sorted = [...entries].sort((a, b) => b.count - a.count);

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    used.add(i);

    const cluster: ClusterData = {
      cities: [sorted[i].city],
      label: sorted[i].city,
      count: sorted[i].count,
      coords: [...sorted[i].coords] as [number, number],
      outlets: [...sorted[i].outlets],
    };

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const dx = sorted[j].coords[0] - sorted[i].coords[0];
      const dy = sorted[j].coords[1] - sorted[i].coords[1];
      if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) {
        used.add(j);
        cluster.cities.push(sorted[j].city);
        cluster.count += sorted[j].count;
        cluster.outlets.push(...sorted[j].outlets);
      }
    }

    if (cluster.cities.length > 1) {
      const ncrCities = ["gurugram", "gurgaon", "new delhi", "delhi", "noida", "faridabad", "ghaziabad", "greater noida", "nehru place"];
      if (cluster.cities.some((c) => ncrCities.includes(c.toLowerCase()))) {
        cluster.label = "NCR";
        cluster.coords = [77.15, 28.55];
      } else {
        cluster.label = `${cluster.cities[0]} +${cluster.cities.length - 1}`;
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

const StateGeographies = memo(function StateGeographies() {
  return (
    <Geographies geography={INDIA_GEO_URL}>
      {({ geographies }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill="#e8edf3"
            stroke="#a8b8c8"
            strokeWidth={0.7}
            style={{
              default: { outline: "none" },
              hover: { fill: "#dce4ee", stroke: "#8899aa", strokeWidth: 0.9, outline: "none" },
              pressed: { outline: "none" },
            }}
          />
        ))
      }
    </Geographies>
  );
});

/** Status dot color helper */
function outletStatusColor(status: string): string {
  switch (status) {
    case "operational": return "#10b981";
    case "fit_out": return "#f59e0b";
    case "closed": return "#ef4444";
    case "under_construction": return "#3b82f6";
    case "up_for_renewal": return "#f59e0b";
    default: return "#a3a3a3";
  }
}

export default function IndiaMap({
  outletsByCity,
  outletDetails,
  selectedCluster: externalSelected,
  onSelectCluster,
}: IndiaMapProps) {
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [82, 22],
    zoom: 1,
  });

  // Hover tooltip state
  const [, setHoveredCluster] = useState<ClusterData | null>(null);
  const [visibleCluster, setVisibleCluster] = useState<ClusterData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [popupOpacity, setPopupOpacity] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clusters = useMemo(() => {
    const raw = Object.entries(outletsByCity)
      .map(([city, count]) => {
        const coords = CITY_COORDS[city.toLowerCase().trim()];
        if (!coords) return null;
        const details = outletDetails?.[city] || [];
        return { city, count, coords, outlets: details };
      })
      .filter(Boolean) as { city: string; count: number; coords: [number, number]; outlets: OutletInfo[] }[];
    return clusterMarkers(raw);
  }, [outletsByCity, outletDetails]);

  const maxCount = useMemo(() => Math.max(...clusters.map((c) => c.count), 1), [clusters]);

  const unmappedCount = Object.keys(outletsByCity).length -
    Object.keys(outletsByCity).filter((c) => CITY_COORDS[c.toLowerCase().trim()]).length;

  const handleMarkerClick = useCallback((cluster: ClusterData) => {
    if (onSelectCluster) {
      const isDeselect = externalSelected === cluster.label;
      onSelectCluster(isDeselect ? null : cluster);
      if (isDeselect) {
        setPosition({ coordinates: [82, 22], zoom: 1 });
      } else {
        setPosition({ coordinates: cluster.coords, zoom: 3.5 });
      }
    }
  }, [onSelectCluster, externalSelected]);

  const handleMarkerEnter = useCallback((cluster: ClusterData, e: React.MouseEvent) => {
    // Cancel any pending hide
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
    // Cancel any pending show from a different marker
    if (enterDelayRef.current) { clearTimeout(enterDelayRef.current); enterDelayRef.current = null; }

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    // If same cluster is already visible, just keep it
    if (visibleCluster?.label === cluster.label) {
      setPopupOpacity(1);
      return;
    }

    // Deliberate 250ms delay — prevents flash on fly-by
    setHoveredCluster(cluster);
    enterDelayRef.current = setTimeout(() => {
      setVisibleCluster(cluster);
      // Trigger fade-in on next frame
      requestAnimationFrame(() => setPopupOpacity(1));
    }, 250);
  }, [visibleCluster]);

  const hidePopup = useCallback(() => {
    if (enterDelayRef.current) { clearTimeout(enterDelayRef.current); enterDelayRef.current = null; }
    // Fade out first, then unmount
    setPopupOpacity(0);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCluster(null);
      setVisibleCluster(null);
    }, 200); // matches CSS transition duration
  }, []);

  const handleMarkerLeave = useCallback(() => {
    // Cancel pending show if mouse left before delay
    if (enterDelayRef.current) { clearTimeout(enterDelayRef.current); enterDelayRef.current = null; }
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
    hoverTimeoutRef.current = setTimeout(() => {
      hidePopup();
    }, 300);
  }, [hidePopup]);

  const handleTooltipEnter = useCallback(() => {
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
    setPopupOpacity(1);
  }, []);

  const handleTooltipLeave = useCallback(() => {
    hidePopup();
  }, [hidePopup]);

  const handleMoveEnd = useCallback((pos: { coordinates: [number, number]; zoom: number }) => {
    setPosition(pos);
  }, []);

  const handleZoomIn = useCallback(() => {
    setPosition((p) => ({ ...p, zoom: Math.min(p.zoom * 1.5, 6) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPosition((p) => ({ ...p, zoom: Math.max(p.zoom / 1.5, 1) }));
  }, []);

  return (
    <div className="relative select-none" ref={containerRef}>
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-px rounded-lg overflow-hidden shadow-sm border border-neutral-200/60" style={{ zIndex: 50 }}>
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white transition-all"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <div className="h-px bg-neutral-200/60" />
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 bg-white/90 backdrop-blur-sm flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-white transition-all"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 1100, center: [82, 22] }}
        width={600}
        height={580}
        style={{ width: "100%", height: "auto", background: "linear-gradient(135deg, #f3f6f9 0%, #edf1f6 50%, #e6ecf3 100%)", borderRadius: 12 }}
      >
        {/* CSS-only hover effects — no React state = no flicker */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="markerShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#334155" floodOpacity="0.25" />
          </filter>
          <style>{`
            .marker-group { cursor: pointer; }
            .marker-group .dot { transition: r 0.2s ease, fill 0.15s ease; }
            .marker-group .glow-ring { transition: opacity 0.2s ease, r 0.2s ease; opacity: 0; }
            .marker-group .label { transition: fill 0.15s ease, font-size 0.15s ease; }
            .marker-group:hover .dot { fill: #171717; }
            .marker-group:hover .glow-ring { opacity: 1; }
            .marker-group:hover .label { fill: #171717; font-weight: 700; }
            .marker-group .pulse { animation: pulse-ring 2s ease-out infinite; }
            @keyframes pulse-ring {
              0% { opacity: 0.4; r: inherit; }
              70% { opacity: 0; }
              100% { opacity: 0; }
            }
          `}</style>
        </defs>

        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={handleMoveEnd}
          minZoom={1}
          maxZoom={6}
        >
          <StateGeographies />

          {[...clusters]
            .sort((a, b) => b.count - a.count)
            .map((cluster) => {
              const isSelected = externalSelected === cluster.label;
              const r = 4 + (cluster.count / maxCount) * 8;

              return (
                <Marker key={cluster.label} coordinates={cluster.coords}>
                  <g
                    className="marker-group"
                    onClick={() => handleMarkerClick(cluster)}
                    onMouseEnter={(e) => handleMarkerEnter(cluster, e as unknown as React.MouseEvent)}
                    onMouseLeave={handleMarkerLeave}
                  >
                    {/* Invisible hit target — slightly larger than dot for comfortable hover */}
                    <circle r={Math.max(r + 6, 10)} fill="transparent" />

                    {/* Pulse animation for selected */}
                    {isSelected && (
                      <circle
                        className="pulse pointer-events-none"
                        r={r + 6}
                        fill="none"
                        stroke="#171717"
                        strokeWidth={1}
                      />
                    )}

                    {/* Hover glow ring (CSS-driven) */}
                    <circle
                      className="glow-ring pointer-events-none"
                      r={r + 5}
                      fill="rgba(23, 23, 23, 0.08)"
                    />

                    {/* Selection dashed ring */}
                    {isSelected && (
                      <circle
                        r={r + 4}
                        fill="none"
                        stroke="#171717"
                        strokeWidth={1.2}
                        strokeDasharray="3,2"
                        className="pointer-events-none"
                      />
                    )}

                    {/* Main dot */}
                    <circle
                      className="dot pointer-events-none"
                      r={r}
                      fill={isSelected ? "#171717" : "#334155"}
                      stroke="#fff"
                      strokeWidth={2}
                      filter={isSelected ? undefined : "url(#markerShadow)"}
                    />

                    {/* Count */}
                    {r >= 5.5 && (
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        className="pointer-events-none"
                        style={{
                          fontSize: r >= 9 ? 7.5 : 6,
                          fill: "#fff",
                          fontWeight: 700,
                          fontFamily: "system-ui, sans-serif",
                        }}
                      >
                        {cluster.count}
                      </text>
                    )}

                    {/* City label */}
                    <text
                      x={0}
                      y={r + 10}
                      textAnchor="middle"
                      className="label pointer-events-none"
                      style={{
                        fontSize: isSelected ? 7.5 : 6.5,
                        fill: isSelected ? "#171717" : "#737373",
                        fontWeight: isSelected ? 700 : 500,
                        fontFamily: "system-ui, sans-serif",
                      }}
                    >
                      {cluster.label}
                    </text>
                  </g>
                </Marker>
              );
            })}
        </ZoomableGroup>
      </ComposableMap>

      {/* ---- Hover Popup: World-class outlet grid callout ---- */}
      {visibleCluster && (() => {
        const cluster = visibleCluster;
        const cw = containerRef.current?.offsetWidth ?? 600;
        const ch = containerRef.current?.offsetHeight ?? 500;
        const popupW = 440;
        const popupH = Math.min(cluster.outlets.length > 0 ? 420 : 60, ch - 20);
        const flipX = tooltipPos.x + popupW + 30 > cw;
        const popupLeft = flipX
          ? Math.max(tooltipPos.x - popupW - 24, 8)
          : Math.min(tooltipPos.x + 24, cw - popupW - 8);
        const popupTop = Math.max(8, Math.min(tooltipPos.y - popupH / 3, ch - popupH - 8));
        const connEndX = flipX ? popupLeft + popupW : popupLeft;
        const connEndY = popupTop + 32;
        const opCount = cluster.outlets.filter(o => o.status === "operational").length;
        const totalRent = cluster.outlets.reduce((s, o) => s + (o.rent ?? 0), 0);

        return (
          <>
            {/* Connector line */}
            <svg
              className="absolute inset-0 z-30 pointer-events-none"
              style={{ width: "100%", height: "100%", overflow: "visible", opacity: popupOpacity, transition: "opacity 0.2s ease" }}
            >
              <line x1={tooltipPos.x} y1={tooltipPos.y} x2={connEndX} y2={connEndY} stroke="#334155" strokeWidth={1.5} strokeDasharray="5,4" opacity={0.25} />
              <circle cx={tooltipPos.x} cy={tooltipPos.y} r={4} fill="#334155" opacity={0.3} />
              <circle cx={tooltipPos.x} cy={tooltipPos.y} r={2} fill="#334155" opacity={0.6} />
            </svg>

            {/* Popup panel */}
            <div
              onMouseEnter={handleTooltipEnter}
              onMouseLeave={handleTooltipLeave}
              className="absolute z-40 pointer-events-auto"
              style={{
                left: popupLeft, top: popupTop, width: popupW,
                opacity: popupOpacity,
                transform: popupOpacity === 1 ? "translateY(0) scale(1)" : "translateY(8px) scale(0.96)",
                transition: "opacity 0.2s ease, transform 0.3s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(24px) saturate(1.8)",
                  WebkitBackdropFilter: "blur(24px) saturate(1.8)",
                  boxShadow: "0 30px 70px -15px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04), 0 10px 25px -8px rgba(0,0,0,0.1)",
                }}
              >
                {/* Header */}
                <div className="px-5 pt-4 pb-3 border-b border-neutral-100/80"
                  style={{ background: "linear-gradient(135deg, rgba(248,250,252,0.8), rgba(241,245,249,0.5))" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-950 flex items-center justify-center shadow-md">
                        <span className="text-base font-bold text-white tabular-nums">{cluster.count}</span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-[2.5px] border-white shadow-sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-neutral-900 tracking-tight">{cluster.label}</h3>
                      {cluster.cities.length > 1 && (
                        <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                          {cluster.cities.join(" \u2022 ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {opCount > 0 && (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[9px] font-semibold text-emerald-600">{opCount} live</span>
                        </div>
                      )}
                      {totalRent > 0 && (
                        <div className="px-2.5 py-1 rounded-full bg-neutral-100/80 border border-neutral-200/60">
                          <span className="text-[9px] font-bold text-neutral-600 tabular-nums">
                            {`\u20B9${Math.round(totalRent).toLocaleString("en-IN")}`}
                            <span className="font-normal text-neutral-400">/mo</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Outlet grid */}
                {cluster.outlets.length > 0 ? (
                  <div className="p-3 max-h-[340px] overflow-y-auto overflow-x-hidden custom-scrollbar">
                    <div className="grid grid-cols-3 gap-2">
                      {cluster.outlets.map((outlet, i) => {
                        const sColor = outletStatusColor(outlet.status);
                        const cardContent = (
                          <div
                            className="group relative rounded-xl border border-neutral-100/80 bg-white/70 p-3 hover:bg-white hover:border-neutral-300 hover:shadow-lg hover:-translate-y-1 active:translate-y-0 active:shadow-md transition-all duration-200 cursor-pointer"
                            style={{
                              animationDelay: `${i * 25}ms`,
                              animation: "popIn 0.25s ease-out both",
                            }}
                          >
                            {/* Status accent bar */}
                            <div
                              className="absolute top-0 left-3 right-3 h-[2.5px] rounded-b-full opacity-50 group-hover:opacity-100 transition-opacity"
                              style={{ backgroundColor: sColor }}
                            />
                            <div className="flex items-start gap-2 mt-1">
                              <div
                                className="w-2.5 h-2.5 rounded-full mt-[2px] flex-shrink-0"
                                style={{
                                  backgroundColor: sColor,
                                  boxShadow: `0 0 0 2px white, 0 0 0 4px ${sColor}40, 0 0 10px ${sColor}30`,
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-semibold text-neutral-800 truncate leading-tight group-hover:text-neutral-950 transition-colors">
                                  {outlet.name}
                                </p>
                                <p className="text-[9px] text-neutral-400 capitalize mt-0.5 leading-tight">
                                  {outlet.status?.replace(/_/g, " ")}
                                </p>
                                {outlet.rent ? (
                                  <p className="text-[10px] font-bold text-neutral-600 tabular-nums mt-1.5 group-hover:text-neutral-900 transition-colors">
                                    {`\u20B9${Math.round(outlet.rent).toLocaleString("en-IN")}`}
                                    <span className="text-[8px] font-normal text-neutral-400">/mo</span>
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );

                        return outlet.id ? (
                          <Link key={i} href={`/outlets/${outlet.id}`}>
                            {cardContent}
                          </Link>
                        ) : (
                          <div key={i}>{cardContent}</div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="px-5 py-4">
                    <p className="text-xs text-neutral-400">
                      {cluster.count} outlet{cluster.count > 1 ? "s" : ""} in this area
                    </p>
                  </div>
                )}

                {/* Footer */}
                {cluster.outlets.length > 0 && (
                  <div className="px-5 py-2.5 border-t border-neutral-100/80 flex items-center justify-between"
                    style={{ background: "rgba(248,250,252,0.5)" }}
                  >
                    <span className="text-[10px] text-neutral-400">
                      Click any outlet to view details
                    </span>
                    <span className="text-[10px] font-medium text-neutral-500">
                      {cluster.outlets.length} outlets
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Animations */}
            <style>{`
              @keyframes popIn {
                from { opacity: 0; transform: scale(0.92) translateY(4px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
              .custom-scrollbar::-webkit-scrollbar { width: 4px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: #d4d4d4; border-radius: 4px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #a3a3a3; }
            `}</style>
          </>
        );
      })()}

      {unmappedCount > 0 && (
        <p className="text-[10px] text-neutral-400 text-center mt-1">
          {unmappedCount} city(ies) not shown on map
        </p>
      )}
    </div>
  );
}
