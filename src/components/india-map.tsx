"use client";

import { useState, useMemo, useCallback, memo, useRef, useEffect } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
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

const STATE_CITIES: Record<string, string[]> = {
  "Maharashtra": ["mumbai", "pune", "nagpur", "thane", "navi mumbai"],
  "Delhi": ["delhi", "new delhi", "nehru place"],
  "Karnataka": ["bangalore", "bengaluru", "mysore", "mysuru", "mangalore", "mangaluru"],
  "Telangana": ["hyderabad"],
  "Tamil Nadu": ["chennai", "coimbatore", "madurai", "tiruchirappalli", "trichy", "pondicherry", "puducherry"],
  "West Bengal": ["kolkata"],
  "Gujarat": ["ahmedabad", "surat", "vadodara", "rajkot"],
  "Rajasthan": ["jaipur", "udaipur", "jodhpur"],
  "Uttar Pradesh": ["lucknow", "noida", "greater noida", "ghaziabad", "agra", "varanasi", "kanpur"],
  "Haryana": ["gurugram", "gurgaon", "faridabad"],
  "Chandigarh": ["chandigarh"],
  "Punjab": ["amritsar", "ludhiana"],
  "Madhya Pradesh": ["indore", "bhopal"],
  "Kerala": ["kochi", "thiruvananthapuram"],
  "Andhra Pradesh": ["visakhapatnam", "vizag"],
  "Bihar": ["patna"],
  "Jharkhand": ["ranchi"],
  "Odisha": ["bhubaneswar"],
  "Uttarakhand": ["dehradun"],
  "Himachal Pradesh": ["shimla"],
  "Jammu & Kashmir": ["jammu"],
  "Goa": ["goa", "panaji"],
  "Chhattisgarh": ["raipur"],
  "Assam": ["guwahati"],
  "Manipur": ["imphal"],
  "Meghalaya": ["shillong"],
  "Sikkim": ["gangtok"],
  "Arunachal Pradesh": ["itanagar"],
  "Nagaland": ["kohima"],
  "Mizoram": ["aizawl"],
  "Tripura": ["agartala"],
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

function outletStatusColor(status: string): string {
  switch (status) {
    case "operational": return "#10b981";
    case "fit_out": return "#f59e0b";
    case "closed": return "#ef4444";
    case "under_construction": return "#3b82f6";
    case "up_for_renewal": return "#f59e0b";
    default: return "#94a3b8";
  }
}

function clusterAccentColor(outlets: OutletInfo[]): string {
  if (outlets.length === 0) return "#132337";
  const statusCounts: Record<string, number> = {};
  outlets.forEach(o => {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  });
  const dominant = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])[0][0];
  return outletStatusColor(dominant);
}

// Which state a city belongs to (reverse lookup)
function getStateForCity(cityLower: string): string | null {
  for (const [state, cities] of Object.entries(STATE_CITIES)) {
    if (cities.includes(cityLower)) return state;
  }
  return null;
}

function StateGeographies({
  stateDensity,
  selectedState,
  onStateClick,
}: {
  stateDensity: Record<string, number>;
  selectedState: string | null;
  onStateClick?: (stateName: string) => void;
}) {
  return (
    <Geographies geography={INDIA_GEO_URL} {...{ disableOptimization: true } as any}>
      {({ geographies }) =>
        geographies.map((geo) => {
          const stateName = geo.properties?.ST_NM || geo.properties?.NAME_1 || "";
          const density = stateDensity[stateName] || 0;
          const isSelected = selectedState === stateName;
          const hasSelection = selectedState !== null;

          // Darker fills for states with outlets
          let baseFill: string;
          let strokeColor: string;
          let strokeW: number;

          if (isSelected) {
            // Selected state: strong navy fill
            baseFill = `rgba(19, 35, 55, 0.35)`;
            strokeColor = "rgba(19, 35, 55, 0.5)";
            strokeW = 1;
          } else if (hasSelection) {
            // Non-selected when something is selected: very faded
            baseFill = density > 0 ? `rgba(19, 35, 55, 0.04)` : "#edf0f3";
            strokeColor = "#d8dce4";
            strokeW = 0.2;
          } else {
            // Default: darker fills than before
            baseFill = density > 0
              ? `rgba(19, 35, 55, ${Math.min(0.10 + density * 0.05, 0.30)})`
              : "#e8ecf1";
            strokeColor = density > 0 ? "rgba(19, 35, 55, 0.22)" : "#cdd2db";
            strokeW = density > 0 ? 0.6 : 0.35;
          }

          const hoverFill = density > 0
            ? `rgba(19, 35, 55, ${Math.min(0.18 + density * 0.06, 0.40)})`
            : "#dde1e8";

          return (
            <Geography
              key={geo.rsmKey}
              geography={geo}
              fill={baseFill}
              stroke={strokeColor}
              strokeWidth={strokeW}
              onClick={(e) => {
                if (density > 0) {
                  e.stopPropagation();
                  onStateClick?.(stateName);
                }
              }}
              style={{
                default: {
                  outline: "none",
                  cursor: density > 0 ? "pointer" : "default",
                  transition: "fill 0.4s ease, stroke 0.4s ease, opacity 0.4s ease",
                },
                hover: {
                  fill: density > 0 ? hoverFill : baseFill,
                  stroke: density > 0 ? "rgba(19, 35, 55, 0.35)" : strokeColor,
                  strokeWidth: density > 0 ? 0.8 : strokeW,
                  outline: "none",
                  cursor: density > 0 ? "pointer" : "default",
                },
                pressed: { outline: "none" },
              }}
            />
          );
        })
      }
    </Geographies>
  );
}

export default function IndiaMap({
  outletsByCity,
  outletDetails,
  selectedCluster: externalSelected,
  onSelectCluster,
}: IndiaMapProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const fadeResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-reset selection after 2 seconds
  useEffect(() => {
    if (fadeResetRef.current) clearTimeout(fadeResetRef.current);
    if (selectedState) {
      fadeResetRef.current = setTimeout(() => {
        setSelectedState(null);
        if (onSelectCluster) onSelectCluster(null);
      }, 2000);
    }
    return () => { if (fadeResetRef.current) clearTimeout(fadeResetRef.current); };
  }, [selectedState, onSelectCluster]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

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
  const totalOutlets = useMemo(() => clusters.reduce((s, c) => s + c.count, 0), [clusters]);

  const stateDensity = useMemo(() => {
    const density: Record<string, number> = {};
    const cityCountMap: Record<string, number> = {};
    Object.entries(outletsByCity).forEach(([city, count]) => {
      cityCountMap[city.toLowerCase().trim()] = count;
    });

    Object.entries(STATE_CITIES).forEach(([state, cities]) => {
      let stateCount = 0;
      cities.forEach(c => {
        stateCount += cityCountMap[c] || 0;
      });
      if (stateCount > 0) {
        density[state] = Math.min(stateCount, 10);
      }
    });
    return density;
  }, [outletsByCity]);

  const unmappedCount = Object.keys(outletsByCity).length -
    Object.keys(outletsByCity).filter((c) => CITY_COORDS[c.toLowerCase().trim()]).length;

  // Click state → select/deselect that state (highlight it, fade others)
  const handleStateClick = useCallback((stateName: string) => {
    setSelectedState(prev => prev === stateName ? null : stateName);
  }, []);

  const handleMarkerClick = useCallback((cluster: ClusterData) => {
    // Find which state this cluster belongs to
    const firstCity = cluster.cities[0]?.toLowerCase();
    const state = firstCity ? getStateForCity(firstCity) : null;

    if (onSelectCluster) {
      const isDeselect = externalSelected === cluster.label;
      onSelectCluster(isDeselect ? null : cluster);
      setSelectedState(isDeselect ? null : (state || null));
    }
  }, [onSelectCluster, externalSelected]);

  const handleMarkerEnter = useCallback((cluster: ClusterData, e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
    if (enterDelayRef.current) { clearTimeout(enterDelayRef.current); enterDelayRef.current = null; }

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (visibleCluster?.label === cluster.label) {
      setPopupOpacity(1);
      return;
    }

    enterDelayRef.current = setTimeout(() => {
      setVisibleCluster(cluster);
      requestAnimationFrame(() => setPopupOpacity(1));
    }, 250);
  }, [visibleCluster]);

  const hidePopup = useCallback(() => {
    if (enterDelayRef.current) { clearTimeout(enterDelayRef.current); enterDelayRef.current = null; }
    setPopupOpacity(0);
    hoverTimeoutRef.current = setTimeout(() => {
      setVisibleCluster(null);
    }, 200);
  }, []);

  const handleMarkerLeave = useCallback(() => {
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

  // Reset selection when clicking map background
  const handleMapBgClick = useCallback(() => {
    setSelectedState(null);
    if (onSelectCluster) onSelectCluster(null);
  }, [onSelectCluster]);

  return (
    <div
      className="relative select-none"
      ref={containerRef}
      onMouseLeave={() => {
        setSelectedState(null);
        if (onSelectCluster) onSelectCluster(null);
      }}
    >
      {/* Top stats bar */}
      <div className="flex items-center justify-between px-3 py-2 mb-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-neutral-500 font-medium">Operational</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[10px] text-neutral-500 font-medium">Fit-out</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[10px] text-neutral-500 font-medium">Closed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[10px] text-neutral-500 font-medium">In Progress</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedState && (
            <button
              onClick={() => { setSelectedState(null); if (onSelectCluster) onSelectCluster(null); }}
              className="text-[10px] font-medium text-[#132337] hover:underline"
            >
              Clear selection
            </button>
          )}
          <span className="text-[10px] text-neutral-400 font-medium tabular-nums">
            {clusters.length} {clusters.length === 1 ? "location" : "locations"} &middot; {totalOutlets} outlets
          </span>
        </div>
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 900, center: [82, 22] }}
        width={600}
        height={620}
        style={{
          width: "100%",
          height: "auto",
          background: "#edf0f4",
          borderRadius: 12,
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.5s ease",
        }}
      >
        <defs>
          <filter id="pillShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#132337" floodOpacity="0.2" />
          </filter>

          <style>{`
            .pill-marker { cursor: pointer; }
            .pill-marker .pill-bg { transition: fill 0.2s ease, opacity 0.2s ease; }
            .pill-marker:hover .pill-bg { opacity: 0.85; }
            @keyframes popIn {
              from { opacity: 0; transform: scale(0.92) translateY(4px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #d4d4d4; border-radius: 4px; }
          `}</style>
        </defs>

        {/* Background rect to catch clicks for deselect */}
        <rect x={0} y={0} width={600} height={620} fill="transparent" onClick={handleMapBgClick} />

        <StateGeographies
          stateDensity={stateDensity}
          selectedState={selectedState}
          onStateClick={handleStateClick}
        />

        {[...clusters]
          .sort((a, b) => b.count - a.count)
          .map((cluster) => {
            const isSelected = externalSelected === cluster.label;
            const accentColor = clusterAccentColor(cluster.outlets);

            // Check if this cluster's state is selected (or no state selection)
            const firstCity = cluster.cities[0]?.toLowerCase();
            const clusterState = firstCity ? getStateForCity(firstCity) : null;
            const isInSelectedState = !selectedState || clusterState === selectedState;
            const markerOpacity = isInSelectedState ? 1 : 0.15;

            // BIGGER pills — increased base scale
            const sizeScale = 1.0 + (cluster.count / maxCount) * 0.35;

            const labelText = cluster.label.length > 10 ? cluster.label.substring(0, 9) + ".." : cluster.label;
            const pillW = Math.max(labelText.length * 5.5 + 28, 48) * sizeScale;
            const pillH = 18 * sizeScale;
            const pillR = pillH / 2;

            return (
              <Marker key={cluster.label} coordinates={cluster.coords}>
                <g
                  className="pill-marker"
                  onClick={(e) => { e.stopPropagation(); handleMarkerClick(cluster); }}
                  onMouseEnter={(e) => handleMarkerEnter(cluster, e as unknown as React.MouseEvent)}
                  onMouseLeave={handleMarkerLeave}
                  style={{ opacity: markerOpacity, transition: "opacity 0.4s ease" }}
                >
                  {/* Invisible hit target */}
                  <rect
                    x={-pillW / 2 - 6}
                    y={-pillH / 2 - 6}
                    width={pillW + 12}
                    height={pillH + 12}
                    fill="transparent"
                  />

                  {/* Selection indicator */}
                  {isSelected && (
                    <rect
                      x={-pillW / 2 - 3}
                      y={-pillH / 2 - 3}
                      width={pillW + 6}
                      height={pillH + 6}
                      rx={pillR + 3}
                      fill="none"
                      stroke="#132337"
                      strokeWidth={1}
                      opacity={0.4}
                      className="pointer-events-none"
                    />
                  )}

                  {/* Main pill shape — #132337 navy */}
                  <rect
                    className="pill-bg pointer-events-none"
                    x={-pillW / 2}
                    y={-pillH / 2}
                    width={pillW}
                    height={pillH}
                    rx={pillR}
                    fill="#132337"
                    filter="url(#pillShadow)"
                  />

                  {/* Status accent dot — bigger */}
                  <circle
                    cx={-pillW / 2 + pillR * 0.85}
                    cy={0}
                    r={3 * sizeScale}
                    fill={accentColor}
                    className="pointer-events-none"
                  />

                  {/* Count — bigger font */}
                  <text
                    x={-pillW / 2 + pillR * 0.85 + 7 * sizeScale}
                    y={0.5}
                    textAnchor="start"
                    dominantBaseline="central"
                    className="pointer-events-none"
                    style={{
                      fontSize: 8.5 * sizeScale,
                      fill: "#ffffff",
                      fontWeight: 700,
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {cluster.count}
                  </text>

                  {/* Separator */}
                  <line
                    x1={-pillW / 2 + pillR * 0.85 + 17 * sizeScale}
                    y1={-pillH * 0.28}
                    x2={-pillW / 2 + pillR * 0.85 + 17 * sizeScale}
                    y2={pillH * 0.28}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={0.5}
                    className="pointer-events-none"
                  />

                  {/* City name — bigger font */}
                  <text
                    x={-pillW / 2 + pillR * 0.85 + 21 * sizeScale}
                    y={0.5}
                    textAnchor="start"
                    dominantBaseline="central"
                    className="pointer-events-none"
                    style={{
                      fontSize: 7 * sizeScale,
                      fill: "rgba(255,255,255,0.75)",
                      fontWeight: 600,
                      fontFamily: "system-ui, -apple-system, sans-serif",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {labelText}
                  </text>

                  {/* Pin dot below pill */}
                  <circle
                    cx={0}
                    cy={pillH / 2 + 3.5}
                    r={1.8}
                    fill={accentColor}
                    className="pointer-events-none"
                  />
                  <line
                    x1={0}
                    y1={pillH / 2}
                    x2={0}
                    y2={pillH / 2 + 2}
                    stroke={accentColor}
                    strokeWidth={0.6}
                    className="pointer-events-none"
                    opacity={0.5}
                  />
                </g>
              </Marker>
            );
          })}
      </ComposableMap>

      {/* Hover Popup */}
      {visibleCluster && (() => {
        const cluster = visibleCluster;
        const cw = containerRef.current?.offsetWidth ?? 600;
        const ch = containerRef.current?.offsetHeight ?? 500;
        const popupW = 420;
        const popupH = Math.min(cluster.outlets.length > 0 ? 400 : 60, ch - 20);
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
              <line x1={tooltipPos.x} y1={tooltipPos.y} x2={connEndX} y2={connEndY} stroke="#132337" strokeWidth={1} strokeDasharray="4,3" opacity={0.2} />
              <circle cx={tooltipPos.x} cy={tooltipPos.y} r={3} fill="#132337" opacity={0.15} />
              <circle cx={tooltipPos.x} cy={tooltipPos.y} r={1.5} fill="#132337" opacity={0.35} />
            </svg>

            {/* Popup panel */}
            <div
              onMouseEnter={handleTooltipEnter}
              onMouseLeave={handleTooltipLeave}
              className="absolute z-40 pointer-events-auto"
              style={{
                left: popupLeft, top: popupTop, width: popupW,
                opacity: popupOpacity,
                transform: popupOpacity === 1 ? "translateY(0) scale(1)" : "translateY(6px) scale(0.97)",
                transition: "opacity 0.2s ease, transform 0.25s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  background: "rgba(250,251,253,0.98)",
                  backdropFilter: "blur(20px)",
                  boxShadow: "0 20px 50px -12px rgba(19, 35, 55, 0.12), 0 0 0 1px rgba(19, 35, 55, 0.06)",
                }}
              >
                {/* Header */}
                <div className="px-4 pt-3.5 pb-3 border-b border-[#e4e8ef]"
                  style={{ background: "rgba(237, 240, 244, 0.5)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-lg bg-[#132337] flex items-center justify-center">
                        <span className="text-sm font-bold text-white tabular-nums">{cluster.count}</span>
                      </div>
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                        style={{ backgroundColor: clusterAccentColor(cluster.outlets) }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[#132337] tracking-tight">{cluster.label}</h3>
                      {cluster.cities.length > 1 && (
                        <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                          {cluster.cities.join(" \u2022 ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {opCount > 0 && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[9px] font-semibold text-emerald-600">{opCount} live</span>
                        </div>
                      )}
                      {totalRent > 0 && (
                        <div className="px-2 py-0.5 rounded-full bg-neutral-50 border border-neutral-200">
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
                  <div className="p-3 max-h-[320px] overflow-y-auto overflow-x-hidden custom-scrollbar">
                    <div className="grid grid-cols-3 gap-1.5">
                      {cluster.outlets.map((outlet, i) => {
                        const sColor = outletStatusColor(outlet.status);
                        const cardContent = (
                          <div
                            className="group relative rounded-lg border border-[#e4e8ef] bg-[#fafbfd] p-2.5 hover:border-neutral-300 hover:shadow-sm transition-all duration-150 cursor-pointer"
                            style={{
                              animationDelay: `${i * 25}ms`,
                              animation: "popIn 0.2s ease-out both",
                            }}
                          >
                            <div className="flex items-start gap-1.5 mt-0.5">
                              <div
                                className="w-2 h-2 rounded-full mt-[2px] flex-shrink-0"
                                style={{ backgroundColor: sColor }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-medium text-[#132337] truncate leading-tight">
                                  {outlet.name}
                                </p>
                                <p className="text-[8px] text-neutral-400 capitalize mt-0.5 leading-tight">
                                  {outlet.status?.replace(/_/g, " ")}
                                </p>
                                {outlet.rent ? (
                                  <p className="text-[9px] font-semibold text-neutral-600 tabular-nums mt-1">
                                    {`\u20B9${Math.round(outlet.rent).toLocaleString("en-IN")}`}
                                    <span className="text-[7px] font-normal text-neutral-400">/mo</span>
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
                  <div className="px-4 py-3">
                    <p className="text-xs text-neutral-400">
                      {cluster.count} outlet{cluster.count > 1 ? "s" : ""} in this area
                    </p>
                  </div>
                )}

                {/* Footer */}
                {cluster.outlets.length > 0 && (
                  <div className="px-4 py-2 border-t border-[#e4e8ef] flex items-center justify-between" style={{ background: "rgba(237, 240, 244, 0.3)" }}>
                    <span className="text-[10px] text-neutral-400">
                      Click outlet to view details
                    </span>
                    <span className="text-[10px] font-medium text-neutral-500">
                      {cluster.outlets.length} outlets
                    </span>
                  </div>
                )}
              </div>
            </div>
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
