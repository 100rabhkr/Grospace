"use client";

import { useState, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

// India-focused projection
const INDIA_GEO_URL = "https://cdn.jsdelivr.net/npm/indian-maps@0.1.0/india-states.json";

// Major Indian city coordinates [lng, lat]
const CITY_COORDS: Record<string, [number, number]> = {
  mumbai: [72.8777, 19.076],
  delhi: [77.1025, 28.7041],
  "new delhi": [77.1025, 28.7041],
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

interface OutletMapData {
  city: string;
  count: number;
  outlets?: { name: string; status: string; rent?: number }[];
}

interface IndiaMapProps {
  outletsByCity: Record<string, number>;
  outletDetails?: Record<string, { name: string; status: string; rent?: number }[]>;
}

function formatINR(amount: number): string {
  const str = Math.round(amount).toString();
  if (str.length <= 3) return `₹${str}`;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${withCommas},${last3}`;
}

export default function IndiaMap({ outletsByCity, outletDetails }: IndiaMapProps) {
  const [hoveredCity, setHoveredCity] = useState<OutletMapData | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const markers = useMemo(() => {
    return Object.entries(outletsByCity)
      .map(([city, count]) => {
        const coords = CITY_COORDS[city.toLowerCase().trim()];
        if (!coords) return null;
        const details = outletDetails?.[city] || [];
        return { city, count, coords, outlets: details };
      })
      .filter(Boolean) as { city: string; count: number; coords: [number, number]; outlets: { name: string; status: string; rent?: number }[] }[];
  }, [outletsByCity, outletDetails]);

  const maxCount = Math.max(...markers.map((m) => m.count), 1);

  return (
    <div className="relative">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 1000,
          center: [82, 22],
        }}
        width={500}
        height={550}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={INDIA_GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#F3F4F6"
                stroke="#D1D5DB"
                strokeWidth={0.5}
                style={{
                  default: { outline: "none" },
                  hover: { fill: "#E5E7EB", outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {markers.map((marker) => {
          const radius = 6 + (marker.count / maxCount) * 14;
          return (
            <Marker
              key={marker.city}
              coordinates={marker.coords}
              onMouseEnter={(e) => {
                setHoveredCity({
                  city: marker.city,
                  count: marker.count,
                  outlets: marker.outlets,
                });
                const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                if (rect) {
                  setTooltipPos({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top - 10,
                  });
                }
              }}
              onMouseLeave={() => setHoveredCity(null)}
            >
              <circle
                r={radius}
                fill="rgba(17, 17, 17, 0.75)"
                stroke="#fff"
                strokeWidth={1.5}
                className="cursor-pointer transition-all hover:fill-black"
              />
              <text
                textAnchor="middle"
                y={3}
                style={{
                  fontFamily: "Arial",
                  fontSize: radius > 12 ? 10 : 8,
                  fill: "#fff",
                  fontWeight: 600,
                  pointerEvents: "none",
                }}
              >
                {marker.count}
              </text>
            </Marker>
          );
        })}
      </ComposableMap>

      {/* Hover tooltip */}
      {hoveredCity && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <Card className="shadow-lg border-neutral-200 min-w-[200px]">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-3.5 w-3.5 text-neutral-500" />
                <span className="text-sm font-semibold">{hoveredCity.city}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  {hoveredCity.count} {hoveredCity.count === 1 ? "outlet" : "outlets"}
                </Badge>
              </div>
              {hoveredCity.outlets && hoveredCity.outlets.length > 0 && (
                <div className="space-y-1.5">
                  {hoveredCity.outlets.slice(0, 5).map((outlet, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-neutral-700 truncate max-w-[120px]">
                        {outlet.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {outlet.rent ? (
                          <span className="text-neutral-500">
                            {formatINR(outlet.rent)}/mo
                          </span>
                        ) : null}
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            outlet.status === "operational"
                              ? "bg-green-500"
                              : outlet.status === "closed"
                              ? "bg-red-500"
                              : "bg-amber-500"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                  {hoveredCity.outlets.length > 5 && (
                    <p className="text-[10px] text-neutral-400">
                      +{hoveredCity.outlets.length - 5} more
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legend for cities without coordinates */}
      {Object.keys(outletsByCity).length > markers.length && (
        <p className="text-[10px] text-neutral-400 text-center mt-1">
          {Object.keys(outletsByCity).length - markers.length} city(ies) not shown on map
        </p>
      )}
    </div>
  );
}
