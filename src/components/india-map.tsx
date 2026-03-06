"use client";

import { useState, useMemo, useCallback, memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { Plus, Minus } from "lucide-react";

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
            fill="#F0F0F0"
            stroke="#D4D4D4"
            strokeWidth={0.5}
            style={{
              default: { outline: "none" },
              hover: { fill: "#E5E5E5", outline: "none" },
              pressed: { outline: "none" },
            }}
          />
        ))
      }
    </Geographies>
  );
});

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
    }
  }, [onSelectCluster, externalSelected]);

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
    <div className="relative select-none">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-0.5">
        <button
          onClick={handleZoomIn}
          className="w-7 h-7 rounded-t-md bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          onClick={handleZoomOut}
          className="w-7 h-7 rounded-b-md bg-white border border-t-0 border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50 transition-colors"
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
        style={{ width: "100%", height: "auto", background: "#FAFAFA", borderRadius: 8 }}
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
                  >
                    {/* Invisible larger hit target */}
                    <circle r={Math.max(r + 8, 12)} fill="transparent" />

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
                      fill={isSelected ? "#171717" : "#525252"}
                      stroke="#fff"
                      strokeWidth={1.5}
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

      {unmappedCount > 0 && (
        <p className="text-[10px] text-neutral-400 text-center mt-1">
          {unmappedCount} city(ies) not shown on map
        </p>
      )}
    </div>
  );
}
