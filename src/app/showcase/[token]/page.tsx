"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getPublicShowcase } from "@/lib/api";
import {
  Building2,
  MapPin,
  Loader2,
  AlertTriangle,
  FileText,
  IndianRupee,
  Ruler,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShowcaseOutlet {
  id: string;
  name: string;
  brand_name: string;
  address: string;
  city: string;
  state: string;
  property_type: string;
  floor: string;
  unit_number: string;
  super_area_sqft: number;
  covered_area_sqft: number;
  status: string;
  franchise_model: string;
}

interface ShowcaseAgreement {
  type: string;
  status: string;
  lease_commencement_date?: string;
  lease_expiry_date?: string;
  monthly_rent?: number;
  cam_monthly?: number;
  security_deposit?: number;
  total_monthly_outflow?: number;
}

interface ShowcaseData {
  title: string;
  description: string;
  outlet: ShowcaseOutlet;
  agreements: ShowcaseAgreement[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  if (!dateStr) return "--";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function propertyTypeLabel(pt: string): string {
  if (!pt) return "Unknown";
  const map: Record<string, string> = {
    mall: "Mall",
    high_street: "High Street",
    cloud_kitchen: "Cloud Kitchen",
    metro: "Metro",
    transit: "Transit",
    cyber_park: "Cyber Park",
    hospital: "Hospital",
    college: "College",
  };
  return map[pt] || pt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(s: string): string {
  return (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function agreementTypeLabel(t: string): string {
  const map: Record<string, string> = {
    lease_loi: "Lease / LOI",
    license_certificate: "License Certificate",
    franchise_agreement: "Franchise Agreement",
  };
  return map[t] || t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ShowcasePage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getPublicShowcase(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Not found"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Loading showcase...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <h1 className="text-xl font-semibold text-neutral-800">
          {error || "Showcase not found"}
        </h1>
        <p className="text-sm text-neutral-500">
          This link may have expired or been deactivated.
        </p>
      </div>
    );
  }

  const { outlet, agreements } = data;
  const hasFinancials = agreements.some((a) => a.monthly_rent != null);

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header Bar */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-neutral-700">
            GroSpace Showcase
          </span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{data.title}</h1>
          {data.description && (
            <p className="text-sm text-neutral-500 mt-1">{data.description}</p>
          )}
        </div>

        {/* Property Overview */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Property Details
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-neutral-500 text-xs">Property Name</span>
              <div className="font-medium">{outlet.name}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Brand</span>
              <div className="font-medium">{outlet.brand_name || "--"}</div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Status</span>
              <div className="font-medium">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                  {statusLabel(outlet.status)}
                </span>
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className="text-neutral-500 text-xs flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Location
              </span>
              <div className="font-medium">
                {[outlet.address, outlet.city, outlet.state].filter(Boolean).join(", ")}
              </div>
            </div>
            <div>
              <span className="text-neutral-500 text-xs">Property Type</span>
              <div className="font-medium">{propertyTypeLabel(outlet.property_type)}</div>
            </div>
            {outlet.floor && (
              <div>
                <span className="text-neutral-500 text-xs">Floor</span>
                <div className="font-medium">{outlet.floor}</div>
              </div>
            )}
            {outlet.unit_number && (
              <div>
                <span className="text-neutral-500 text-xs">Unit</span>
                <div className="font-medium">{outlet.unit_number}</div>
              </div>
            )}
            {outlet.franchise_model && (
              <div>
                <span className="text-neutral-500 text-xs">Model</span>
                <div className="font-medium">{outlet.franchise_model}</div>
              </div>
            )}
          </div>

          {/* Area */}
          {(outlet.super_area_sqft > 0 || outlet.covered_area_sqft > 0) && (
            <>
              <div className="border-t border-neutral-100 pt-4">
                <h3 className="text-sm font-medium flex items-center gap-1.5 mb-3">
                  <Ruler className="h-3.5 w-3.5 text-neutral-400" />
                  Area
                </h3>
                <div className="flex gap-6 text-sm">
                  {outlet.super_area_sqft > 0 && (
                    <div>
                      <span className="text-neutral-500 text-xs">Super Area</span>
                      <div className="font-medium">{outlet.super_area_sqft.toLocaleString("en-IN")} sqft</div>
                    </div>
                  )}
                  {outlet.covered_area_sqft > 0 && (
                    <div>
                      <span className="text-neutral-500 text-xs">Covered Area</span>
                      <div className="font-medium">{outlet.covered_area_sqft.toLocaleString("en-IN")} sqft</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Agreements */}
        {agreements.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Agreement Summary
            </h2>
            {agreements.map((agr, idx) => (
              <div
                key={idx}
                className="border border-neutral-100 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{agreementTypeLabel(agr.type)}</span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700">
                    {statusLabel(agr.status)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {agr.lease_commencement_date && (
                    <div>
                      <span className="text-neutral-500 text-xs">Commencement</span>
                      <div className="font-medium">{formatDate(agr.lease_commencement_date)}</div>
                    </div>
                  )}
                  {agr.lease_expiry_date && (
                    <div>
                      <span className="text-neutral-500 text-xs">Expiry</span>
                      <div className="font-medium">{formatDate(agr.lease_expiry_date)}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Financials (only if include_financials is true) */}
        {hasFinancials && (
          <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Financial Overview
            </h2>
            {agreements.map((agr, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                {agr.monthly_rent != null && agr.monthly_rent > 0 && (
                  <div>
                    <span className="text-neutral-500 text-xs">Monthly Rent</span>
                    <div className="font-semibold">{formatCurrency(agr.monthly_rent)}</div>
                  </div>
                )}
                {agr.cam_monthly != null && agr.cam_monthly > 0 && (
                  <div>
                    <span className="text-neutral-500 text-xs">CAM / Month</span>
                    <div className="font-semibold">{formatCurrency(agr.cam_monthly)}</div>
                  </div>
                )}
                {agr.security_deposit != null && agr.security_deposit > 0 && (
                  <div>
                    <span className="text-neutral-500 text-xs">Security Deposit</span>
                    <div className="font-semibold">{formatCurrency(agr.security_deposit)}</div>
                  </div>
                )}
                {agr.total_monthly_outflow != null && agr.total_monthly_outflow > 0 && (
                  <div>
                    <span className="text-neutral-500 text-xs">Total Monthly</span>
                    <div className="font-semibold">{formatCurrency(agr.total_monthly_outflow)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 border-t border-neutral-200">
          <p className="text-xs text-neutral-400">
            Powered by GroSpace &middot; AI-first Lease Management
          </p>
        </div>
      </div>
    </div>
  );
}
