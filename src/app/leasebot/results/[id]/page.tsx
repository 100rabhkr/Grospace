"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Shield,
  AlertTriangle,
  Lock,
  Loader2,
  ArrowRight,
  Building2,
  MapPin,
  IndianRupee,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getLeasebotResults, convertLeasebot } from "@/lib/api";

function isDemoUser(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some(c => c.trim().startsWith("grospace-demo-session=authenticated"));
}

type AnalysisResult = {
  token: string;
  health_score: number;
  document_type: string;
  risk_count?: number;
  sample_fields?: {
    property: string | null;
    city: string | null;
    rent: number | null;
  };
  // Full data (authenticated only)
  extraction?: Record<string, Record<string, unknown>>;
  risk_flags?: Array<{
    severity: string;
    explanation: string;
    name?: string;
    clause_text?: string;
  }>;
  authenticated?: boolean;
  converted?: boolean;
  agreement_id?: string;
  created_at?: string;
};

function HealthScoreGauge({ score }: { score: number }) {
  const color =
    score >= 70 ? "text-emerald-600" :
    score >= 40 ? "text-amber-500" :
    "text-red-500";

  const bgColor =
    score >= 70 ? "bg-emerald-50 border-emerald-200" :
    score >= 40 ? "bg-amber-50 border-amber-200" :
    "bg-red-50 border-red-200";

  const label =
    score >= 70 ? "Good" :
    score >= 40 ? "Fair" :
    "Poor";

  // SVG circular gauge
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const strokeColor =
    score >= 70 ? "#059669" :
    score >= 40 ? "#f59e0b" :
    "#ef4444";

  return (
    <div className={`flex flex-col items-center p-6 rounded-xl border ${bgColor}`}>
      <div className="relative w-36 h-36 mb-3">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{score}</span>
          <span className="text-xs text-[#6b7280]">/ 100</span>
        </div>
      </div>
      <Badge variant="outline" className={`text-xs ${color}`}>
        {label}
      </Badge>
      <p className="text-xs text-[#6b7280] mt-2">Lease Health Score</p>
    </div>
  );
}

function getFieldDisplayValue(val: unknown): string {
  if (val === null || val === undefined || val === "" || val === "not_found" || val === "N/A") {
    return "Not found";
  }
  if (typeof val === "object" && !Array.isArray(val) && val !== null) {
    const obj = val as Record<string, unknown>;
    if ("value" in obj) {
      const v = obj.value;
      if (v === null || v === undefined || v === "" || v === "not_found") return "Not found";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }
    return Object.entries(obj)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join(" | ");
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return "Not found";
    return val.map((item) => {
      if (typeof item === "object" && item !== null) {
        const o = item as Record<string, unknown>;
        const period = o.year || o.period || o.years || "";
        const rent = o.monthly_rent || o.mglr_monthly || "";
        if (period && rent) return `${period}: Rs ${Number(rent).toLocaleString("en-IN")}/mo`;
        return Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" | ");
      }
      return String(item);
    }).join("\n");
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Sqft", "(sqft)")
    .replace("Pct", "%")
    .replace("Cam ", "CAM ")
    .replace("Mglr", "MGLR");
}

const sectionLabels: Record<string, string> = {
  parties: "Parties & Entities",
  premises: "Premises & Location",
  lease_term: "Lease Term & Dates",
  rent: "Rent & Revenue",
  charges: "Charges & CAM",
  deposits: "Security Deposits",
  legal: "Legal & Compliance",
  franchise: "Franchise Details",
};

export default function LeasebotResultsPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.id as string;

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const [isDemo, setIsDemo] = useState(false);
  const isAuthenticated = isDemo || (result && result.authenticated === true && result.extraction);

  useEffect(() => {
    // Check demo cookie on client side after mount
    const demo = isDemoUser();
    setIsDemo(demo);

    async function fetchResults() {
      try {
        const data = await getLeasebotResults(token, demo);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load results.");
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [token]);

  async function handleConvert() {
    setIsConverting(true);
    setError(null);
    try {
      const data = await convertLeasebot(token);
      if (data.agreement_id) {
        router.push(`/agreements/${data.agreement_id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setIsConverting(false);
    }
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafbfd] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-[#132337] animate-spin" />
          <p className="text-sm text-[#6b7280]">Loading analysis results...</p>
        </div>
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="min-h-screen bg-[#fafbfd] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-[#132337] mb-2">Analysis Not Found</h2>
            <p className="text-sm text-[#6b7280] mb-6">{error}</p>
            <Link href="/leasebot">
              <Button className="gap-2 bg-[#132337] hover:bg-[#1a2f47]">
                <Sparkles className="h-4 w-4" />
                Try Again
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result) return null;

  const riskCount = result.risk_count ?? (result.risk_flags?.length || 0);

  return (
    <div className="min-h-screen bg-[#fafbfd]">
      {/* Header */}
      <header className="border-b border-[#e4e8ef] bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/leasebot" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="GroSpace" width={28} height={28} className="rounded-md" />
            <span className="text-[17px] font-semibold tracking-tight text-[#132337]">GroSpace</span>
            <Badge variant="outline" className="text-[10px] ml-1">Leasebot</Badge>
          </Link>
          {!isAuthenticated ? (
            <a href={`/auth/login?redirect=/leasebot/results/${token}&convert=true`}>
              <Button size="sm" className="bg-[#132337] hover:bg-[#1a2f47]">
                Sign in
              </Button>
            </a>
          ) : (
            <Link href="/">
              <Button variant="outline" size="sm">
                Dashboard
              </Button>
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Error Banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Top Section: Score + Summary */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Health Score */}
          <HealthScoreGauge score={result.health_score} />

          {/* Document Info */}
          <div className="flex flex-col justify-center gap-4 p-6 rounded-xl border border-[#e4e8ef] bg-white">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-semibold mb-1">Document Type</p>
              <Badge variant="outline" className="text-xs">
                {(result.document_type || "unknown").replace(/_/g, " ").toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-semibold mb-1">Risk Flags</p>
              <div className="flex items-center gap-2">
                <Shield className={`h-4 w-4 ${riskCount > 0 ? "text-red-500" : "text-emerald-500"}`} />
                <span className="text-sm font-semibold text-[#132337]">
                  {riskCount} {riskCount === 1 ? "flag" : "flags"} detected
                </span>
              </div>
            </div>
            {result.created_at && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-semibold mb-1">Analyzed</p>
                <p className="text-xs text-[#6b7280]">
                  {new Date(result.created_at).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Sample Fields */}
          <div className="flex flex-col justify-center gap-4 p-6 rounded-xl border border-[#e4e8ef] bg-white">
            <p className="text-[10px] uppercase tracking-wider text-[#9ca3af] font-semibold">Key Details</p>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Building2 className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#9ca3af]">Property</p>
                  <p className="text-sm font-medium text-[#132337]">
                    {result.sample_fields?.property || "Not found"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#9ca3af]">City</p>
                  <p className="text-sm font-medium text-[#132337]">
                    {result.sample_fields?.city || "Not found"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <IndianRupee className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-[#9ca3af]">Monthly Rent</p>
                  <p className="text-sm font-medium text-[#132337]">
                    {result.sample_fields?.rent
                      ? `Rs ${Number(result.sample_fields.rent).toLocaleString("en-IN")}`
                      : "Not found"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator className="mb-8" />

        {/* Full Extraction Section */}
        {isAuthenticated && result.extraction ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#132337]">Full Extraction</h2>
              {!result.converted && (
                <Button
                  onClick={handleConvert}
                  disabled={isConverting}
                  className="gap-2 bg-[#132337] hover:bg-[#1a2f47]"
                >
                  {isConverting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Converting...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4" />
                      Convert to Agreement
                    </>
                  )}
                </Button>
              )}
              {result.converted && result.agreement_id && (
                <Link href={`/agreements/${result.agreement_id}`}>
                  <Button variant="outline" className="gap-2">
                    <FileText className="h-4 w-4" />
                    View Agreement
                  </Button>
                </Link>
              )}
            </div>

            {/* Risk Flags */}
            {result.risk_flags && result.risk_flags.length > 0 && (
              <Card className="border-red-200">
                <button
                  className="w-full flex items-center gap-2 px-4 py-3 bg-red-50/50 hover:bg-red-50 transition-colors text-left"
                  onClick={() => toggleSection("_risk_flags")}
                >
                  <Shield className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <span className="text-sm font-semibold flex-1">Risk Flags</span>
                  <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 mr-1">
                    {result.risk_flags.length}
                  </Badge>
                  {collapsedSections["_risk_flags"] ? (
                    <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-[#9ca3af]" />
                  )}
                </button>
                {!collapsedSections["_risk_flags"] && (
                  <CardContent className="pt-3 pb-3 space-y-2">
                    {result.risk_flags.map((flag, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg border ${
                          flag.severity === "high"
                            ? "border-red-200 bg-red-50/50"
                            : "border-amber-200 bg-amber-50/50"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle
                            className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${
                              flag.severity === "high" ? "text-red-500" : "text-amber-500"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium">{flag.name || flag.explanation}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${
                                  flag.severity === "high"
                                    ? "border-red-300 text-red-700"
                                    : "border-amber-300 text-amber-700"
                                }`}
                              >
                                {flag.severity}
                              </Badge>
                            </div>
                            {flag.explanation && flag.name && (
                              <p className="text-[11px] text-[#6b7280]">{flag.explanation}</p>
                            )}
                            {flag.clause_text && (
                              <p className="text-[11px] text-[#6b7280] italic mt-1 line-clamp-2">
                                &ldquo;{flag.clause_text}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Extracted Sections */}
            {Object.entries(result.extraction).map(([sectionKey, sectionData]) => {
              if (typeof sectionData !== "object" || sectionData === null) return null;
              const fields = Object.entries(sectionData as Record<string, unknown>);
              if (fields.length === 0) return null;

              const isCollapsed = !!collapsedSections[sectionKey];
              const sectionTitle = sectionLabels[sectionKey] || formatFieldLabel(sectionKey);

              return (
                <Card key={sectionKey} className="overflow-hidden">
                  <button
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#f4f6f9]/80 transition-colors text-left"
                    onClick={() => toggleSection(sectionKey)}
                  >
                    <span className="text-sm font-semibold flex-1">{sectionTitle}</span>
                    <Badge variant="outline" className="text-[10px] mr-1">
                      {fields.length} {fields.length === 1 ? "field" : "fields"}
                    </Badge>
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-[#9ca3af]" />
                    )}
                  </button>
                  {!isCollapsed && (
                    <>
                      <Separator />
                      <CardContent className="pt-3 pb-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                          {fields.map(([fieldKey, fieldVal]) => {
                            const displayVal = getFieldDisplayValue(fieldVal);
                            const isNotFound = displayVal === "Not found";
                            const isCurrency = /rent|deposit|cam_monthly|outflow|amount/.test(fieldKey);

                            let formattedVal = displayVal;
                            if (!isNotFound && isCurrency && !isNaN(Number(displayVal.replace(/,/g, "")))) {
                              formattedVal = `Rs ${Number(displayVal.replace(/,/g, "")).toLocaleString("en-IN")}`;
                            }

                            return (
                              <div key={fieldKey} className={`min-w-0 rounded-lg p-2.5 -mx-1 ${isNotFound ? "opacity-50" : ""}`}>
                                <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider font-semibold mb-1">
                                  {formatFieldLabel(fieldKey)}
                                </p>
                                {isNotFound ? (
                                  <p className="text-xs text-[#d1d5db] italic">Not found in document</p>
                                ) : displayVal.includes("\n") ? (
                                  <div className="space-y-1">
                                    {formattedVal.split("\n").filter(Boolean).map((line, idx) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#132337] mt-1.5 flex-shrink-0" />
                                        <span className="text-sm text-[#132337] font-medium">{line}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm font-medium text-[#132337]">{formattedVal}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          /* Gated Section (unauthenticated) */
          <div className="relative">
            {/* Blurred preview */}
            <div className="space-y-4 filter blur-sm select-none pointer-events-none" aria-hidden="true">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      "Lessor Name", "Lessee Name", "Property Type", "Lease Start",
                      "Lease Expiry", "Lock-in Period", "Monthly Rent", "Security Deposit",
                      "CAM Monthly", "Escalation %", "Notice Period", "Area (sqft)",
                    ].map((label) => (
                      <div key={label} className="p-2.5">
                        <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider font-semibold mb-1">{label}</p>
                        <div className="h-4 w-32 bg-[#e4e8ef] rounded" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200">
                <CardContent className="pt-4 pb-4">
                  <p className="text-sm font-semibold mb-2">Risk Flag Details</p>
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-red-50 rounded-lg border border-red-200" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Lock overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-xl">
              <div className="text-center max-w-sm">
                <div className="h-14 w-14 rounded-full bg-[#132337] flex items-center justify-center mx-auto mb-4">
                  <Lock className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-[#132337] mb-2">
                  Sign up free to unlock full analysis
                </h3>
                <p className="text-sm text-[#6b7280] mb-6">
                  Get the complete extraction table, detailed risk flags, and AI-powered Q&A for your lease.
                </p>
                <a href={`/auth/login?redirect=/leasebot/results/${token}&convert=true`}>
                  <Button className="gap-2 bg-[#132337] hover:bg-[#1a2f47] px-8" size="lg">
                    <Sparkles className="h-4 w-4" />
                    Sign up free to unlock
                  </Button>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-[#e4e8ef] bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <p className="text-xs text-[#9ca3af]">Powered by GroSpace AI</p>
          <Link href="/leasebot" className="text-xs text-[#132337] font-medium hover:underline">
            Analyze another lease
          </Link>
        </div>
      </footer>
    </div>
  );
}
