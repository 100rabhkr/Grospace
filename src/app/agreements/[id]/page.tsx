"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  FileText,
  AlertTriangle,
  ShieldAlert,
  CalendarClock,
  MessageSquare,
  Send,
  ClipboardList,
  Bot,
  User,
  Loader2,
  Building2,
  Calendar,
  IndianRupee,
  Scale,
  Landmark,
  Users,
  RotateCcw,
  Sparkles,
  Check,
  CheckSquare,
  Rocket,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAgreement, askDocumentQuestion, updateAgreement, confirmAndActivate } from "@/lib/api";
import dynamic from "next/dynamic";
const PdfViewer = dynamic(() => import("@/components/pdf-viewer").then(mod => ({ default: mod.PdfViewer })), { ssr: false, loading: () => <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">Loading PDF viewer...</div> });
import { EditableField } from "@/components/editable-field";
import { FeedbackButton } from "@/components/feedback-button";
import { RentScheduleTable } from "@/components/rent-schedule-table";
import { CriticalDatesCard } from "@/components/critical-dates-card";
import AgreementTimeline from "@/components/agreement-timeline";
import { HealthScoreGauge } from "@/components/health-score-gauge";

// --- Types ---

type RiskFlag = {
  id?: number;
  flag_id?: number;
  name: string;
  severity: "high" | "medium";
  explanation: string;
  clause_text?: string;
};

type OutletInfo = {
  name: string;
  city: string;
  address: string;
  property_type: string;
  status: string;
};

type Obligation = {
  id: string;
  type: string;
  frequency: string;
  amount: number | null;
  due_day_of_month: number | null;
  start_date: string | null;
  end_date: string | null;
  escalation_pct: number | null;
  escalation_frequency_years: number | null;
  is_active: boolean;
};

type Agreement = {
  id: string;
  org_id: string;
  outlet_id: string;
  type: string;
  status: string;
  document_filename: string;
  extracted_data: Record<string, Record<string, unknown>> | null;
  extraction_status: string;
  risk_flags: RiskFlag[];
  lessor_name: string | null;
  lessee_name: string | null;
  brand_name: string | null;
  lease_commencement_date: string | null;
  lease_expiry_date: string | null;
  monthly_rent: number | null;
  cam_monthly: number | null;
  total_monthly_outflow: number | null;
  security_deposit: number | null;
  document_url: string | null;
  confirmed_at: string | null;
  created_at: string;
  outlets: OutletInfo | null;
};

type ChatMessage = {
  role: "user" | "assistant";
  message: string;
};

// --- Helpers (reused from upload page) ---

type Confidence = "high" | "medium" | "low" | "not_found";

function ConfidenceDot({ level }: { level: Confidence }) {
  const colors: Record<Confidence, string> = {
    high: "bg-emerald-500",
    medium: "bg-amber-500",
    low: "bg-rose-400",
    not_found: "bg-slate-300",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${colors[level] || colors.not_found}`}
    />
  );
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Sqft", "(sqft)")
    .replace("Pct", "%")
    .replace("Per Kw", "per KW")
    .replace("Cin", "CIN")
    .replace("Cam ", "CAM ")
    .replace("Hvac", "HVAC")
    .replace("Mglr", "MGLR")
    .replace("Tds", "TDS");
}

const sectionConfig: Record<
  string,
  { title: string; icon: React.ElementType }
> = {
  parties: { title: "Parties & Entities", icon: Users },
  premises: { title: "Premises & Location", icon: Building2 },
  lease_term: { title: "Lease Term & Dates", icon: Calendar },
  rent: { title: "Rent & Revenue", icon: IndianRupee },
  charges: { title: "Charges & CAM", icon: IndianRupee },
  deposits: { title: "Security Deposits", icon: Landmark },
  legal: { title: "Legal & Compliance", icon: Scale },
  franchise: { title: "Franchise Details", icon: Building2 },
};

function parseField(fieldVal: unknown): {
  displayVal: string;
  confidence: Confidence;
} {
  if (
    fieldVal === null ||
    fieldVal === undefined ||
    fieldVal === "" ||
    fieldVal === "not_found" ||
    fieldVal === "N/A"
  ) {
    return { displayVal: "Not found", confidence: "not_found" };
  }

  if (typeof fieldVal === "object" && !Array.isArray(fieldVal)) {
    const obj = fieldVal as Record<string, unknown>;
    if ("value" in obj) {
      const conf = (
        typeof obj.confidence === "string" ? obj.confidence : "high"
      ) as Confidence;
      const val = obj.value;
      if (
        val === null ||
        val === undefined ||
        val === "" ||
        val === "not_found" ||
        val === "N/A"
      ) {
        return { displayVal: "Not found", confidence: "not_found" };
      }
      if (typeof val === "object") {
        return { displayVal: parseField(val).displayVal, confidence: conf };
      }
      return { displayVal: String(val), confidence: conf };
    }
    return {
      displayVal: Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(" | "),
      confidence: "high",
    };
  }

  if (Array.isArray(fieldVal)) {
    if (fieldVal.length === 0)
      return { displayVal: "Not found", confidence: "not_found" };
    const items = fieldVal.map((item) => {
      if (typeof item === "object" && item !== null) {
        const o = item as Record<string, unknown>;
        if (o.year || o.period || o.years || o.from_year || o.to_year) {
          const period = o.year || o.period || o.years || (o.from_year && o.to_year ? `Year ${o.from_year}-${o.to_year}` : o.from_year || o.to_year) || "";
          const rent = o.monthly_rent || o.mglr_monthly || o.rent || o.amount || "";
          const perSqft = o.rent_per_sqft || o.mglr_per_sqft || o.mglr_rate_per_sqft || o.per_sqft || "";
          const revShare = o.revenue_share_net_sales_pct || o.revenue_share_takeaway_dining || o.revenue_share || "";
          const revOnline = o.revenue_share_online || o.revenue_share_deliveries_pct || "";
          const type = o.type || "";
          const details = o.details || "";
          const condition = o.condition || "";
          let line = `Year ${period}`;
          if (type) line += ` (${type})`;
          if (details) line += `: ${details}`;
          if (rent) line += `${details ? " | " : ": "}Rs ${Number(rent).toLocaleString("en-IN")}/sqft`;
          if (perSqft) line += ` (Rs ${perSqft}/sqft)`;
          if (revShare) line += ` | Rev Share: ${revShare}%`;
          if (revOnline) line += `, Delivery: ${revOnline}%`;
          if (condition && !details) line += ` [${condition}]`;
          return line;
        }
        return Object.entries(o)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
          .join(" | ");
      }
      return String(item);
    });
    return { displayVal: items.join("\n"), confidence: "high" };
  }

  if (typeof fieldVal === "boolean") {
    return { displayVal: fieldVal ? "Yes" : "No", confidence: "high" };
  }
  if (typeof fieldVal === "number") {
    return {
      displayVal: fieldVal.toLocaleString("en-IN"),
      confidence: "high",
    };
  }
  return { displayVal: String(fieldVal), confidence: "high" };
}

function statusColor(status: string): string {
  if (!status) return "bg-muted text-[#4a5568]";
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700",
    expiring: "bg-amber-50 text-amber-700",
    expired: "bg-rose-50 text-rose-700",
    terminated: "bg-rose-50 text-rose-700",
    draft: "bg-muted text-[#4a5568]",
    renewed: "bg-emerald-50 text-emerald-700",
    confirmed: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-700",
    processing: "bg-muted text-foreground",
    pending: "bg-muted text-[#4a5568]",
    failed: "bg-rose-50 text-rose-700",
    high: "bg-rose-50 text-rose-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-muted text-foreground",
  };
  return map[status] || "bg-muted text-[#4a5568]";
}

function statusLabel(status: string): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `Rs ${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `Rs ${(amount / 100000).toFixed(2)} L`;
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// --- Loading Skeleton ---

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-start gap-3">
        <div className="h-9 w-16 bg-border rounded animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-border rounded animate-pulse" />
            <div className="h-5 w-16 bg-border rounded animate-pulse" />
          </div>
          <div className="h-7 w-64 bg-border rounded animate-pulse" />
          <div className="h-4 w-96 bg-border rounded animate-pulse" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-full max-w-2xl bg-border rounded animate-pulse" />

      {/* Content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-5 w-32 bg-border rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j}>
                    <div className="h-3 w-20 bg-border rounded animate-pulse mb-1" />
                    <div className="h-4 w-40 bg-border rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// --- Page ---

export default function AgreementDetailPage() {
  const params = useParams();
  const agreementId = params.id as string;

  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [qaSessionId, setQaSessionId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Activate draft state
  const [activating, setActivating] = useState(false);

  // Inline editing state
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Verification checkboxes state for extracted fields
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());

  function toggleFieldVerified(fieldPath: string) {
    setVerifiedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldPath)) {
        next.delete(fieldPath);
      } else {
        next.add(fieldPath);
      }
      return next;
    });
  }

  const hasEdits = Object.keys(editedFields).length > 0;

  function handleFieldEdit(sectionKey: string, fieldKey: string, newValue: string) {
    setEditedFields((prev) => ({ ...prev, [`${sectionKey}.${fieldKey}`]: newValue }));
  }

  function discardEdits() {
    setEditedFields({});
  }

  /** Export extracted data + risk flags as a downloadable CSV/text summary */
  function handleExportReview() {
    if (!agreement) return;
    const lines: string[] = [];
    lines.push("DRAFT LEASE REVIEW EXPORT");
    lines.push(`Agreement ID: ${agreement.id}`);
    lines.push(`Type: ${agreement.type}`);
    lines.push(`Status: ${agreement.status}`);
    lines.push(`Document: ${agreement.document_filename}`);
    if (agreement.lessor_name) lines.push(`Lessor: ${agreement.lessor_name}`);
    if (agreement.lessee_name) lines.push(`Lessee: ${agreement.lessee_name}`);
    if (agreement.brand_name) lines.push(`Brand: ${agreement.brand_name}`);
    if (agreement.lease_commencement_date) lines.push(`Commencement: ${agreement.lease_commencement_date}`);
    if (agreement.lease_expiry_date) lines.push(`Expiry: ${agreement.lease_expiry_date}`);
    if (agreement.monthly_rent != null) lines.push(`Monthly Rent: ${agreement.monthly_rent}`);
    if (agreement.cam_monthly != null) lines.push(`CAM Monthly: ${agreement.cam_monthly}`);
    if (agreement.total_monthly_outflow != null) lines.push(`Total Monthly Outflow: ${agreement.total_monthly_outflow}`);
    if (agreement.security_deposit != null) lines.push(`Security Deposit: ${agreement.security_deposit}`);
    lines.push("");

    // Extracted data sections
    const data = agreement.extracted_data;
    if (data && typeof data === "object") {
      lines.push("--- EXTRACTED DATA ---");
      for (const [section, fields] of Object.entries(data)) {
        if (section === "health_score") continue;
        if (typeof fields === "object" && fields !== null) {
          lines.push("");
          lines.push(`[${section.replace(/_/g, " ").toUpperCase()}]`);
          for (const [key, val] of Object.entries(fields as Record<string, unknown>)) {
            const { displayVal } = parseField(val);
            lines.push(`${formatFieldLabel(key)}: ${displayVal}`);
          }
        }
      }
      lines.push("");
    }

    // Risk flags
    const flags = agreement.risk_flags || [];
    lines.push("--- RISK FLAGS ---");
    if (flags.length === 0) {
      lines.push("No risk flags detected.");
    } else {
      for (const flag of flags) {
        lines.push(`[${flag.severity.toUpperCase()}] ${flag.name}: ${flag.explanation}`);
        if (flag.clause_text) lines.push(`  Clause: ${flag.clause_text}`);
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `draft-review-${agreement.id.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function saveEdits() {
    if (!agreement || !hasEdits) return;
    setSaving(true);
    try {
      const res = await updateAgreement(agreementId, { field_updates: editedFields });
      if (res.agreement) {
        setAgreement(res.agreement);
      }
      setEditedFields({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    if (!agreement) return;
    setActivating(true);
    try {
      await confirmAndActivate({
        extraction: (agreement.extracted_data as Record<string, unknown>) || {},
        document_type: agreement.type,
        risk_flags: agreement.risk_flags || [],
        confidence: {},
        filename: agreement.document_filename,
        document_text: null,
        document_url: agreement.document_url,
      });
      // Refresh agreement data after activation
      const data = await getAgreement(agreementId);
      setAgreement(data.agreement || null);
      setObligations(data.obligations || []);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to activate agreement");
    } finally {
      setActivating(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchAgreement() {
      try {
        setLoading(true);
        setError(null);
        const data = await getAgreement(agreementId);
        if (!cancelled) {
          setAgreement(data.agreement || null);
          setObligations(data.obligations || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load agreement"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchAgreement();
    return () => {
      cancelled = true;
    };
  }, [agreementId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function handleSendMessage(questionOverride?: string) {
    const question = (questionOverride || chatInput).trim();
    if (!question || chatLoading) return;

    setChatInput("");
    setChatMessages((prev) => [
      ...prev,
      { role: "user", message: question },
    ]);
    setChatLoading(true);

    try {
      const response = await askDocumentQuestion(agreementId, question, qaSessionId || undefined);
      if (response.session_id) {
        setQaSessionId(response.session_id);
      }
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          message: response.answer || response.response || "No response received.",
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          message: `Sorry, I encountered an error: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function clearConversation() {
    setChatMessages([]);
    setQaSessionId(null);
  }

  // --- Loading State ---
  if (loading) {
    return <DetailSkeleton />;
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertTriangle className="h-12 w-12 text-rose-500" />
        <h2 className="text-lg font-semibold">Failed to load agreement</h2>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          {error}
        </p>
        <div className="flex gap-3">
          <Link href="/agreements">
            <Button variant="outline" className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Agreements
            </Button>
          </Link>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  // --- Not Found ---
  if (!agreement) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <FileText className="h-12 w-12 text-[#d1d5db]" />
        <h2 className="text-lg font-semibold">Agreement not found</h2>
        <p className="text-sm text-muted-foreground">
          The agreement with ID &quot;{agreementId}&quot; does not exist.
        </p>
        <Link href="/agreements">
          <Button variant="outline" className="gap-2">
            <ChevronLeft className="h-4 w-4" />
            Back to Agreements
          </Button>
        </Link>
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    lease_loi: "Lease / LOI",
    license_certificate: "License Certificate",
    franchise_agreement: "Franchise Agreement",
  };

  const outletName = agreement.outlets?.name || "Unknown Outlet";
  const riskFlags = agreement.risk_flags || [];
  const extractedData = agreement.extracted_data;

  // Extract health_score from extracted_data if present
  let healthScore: number | null = null;
  if (extractedData && typeof extractedData === "object") {
    const hs =
      (extractedData as Record<string, unknown>).health_score ||
      ((extractedData as Record<string, Record<string, unknown>>).lease_term || {}).health_score;
    if (typeof hs === "number") healthScore = hs;
    else if (typeof hs === "object" && hs && "value" in (hs as Record<string, unknown>)) {
      const val = (hs as Record<string, unknown>).value;
      if (typeof val === "number") healthScore = val;
    }
  }

  // Build timeline dates from extracted data
  const timelineDates: { label: string; date: string; type: "past" | "current" | "future" | "warning" }[] = [];
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  function classifyDate(dateStr: string): "past" | "current" | "future" | "warning" {
    const d = new Date(dateStr);
    if (d < now) return "past";
    if (d <= warningThreshold) return "warning";
    return "future";
  }

  // Helper to extract date value from extracted data fields
  function getExtractedDate(sectionKey: string, fieldKey: string): string | null {
    if (!extractedData || !extractedData[sectionKey]) return null;
    const field = (extractedData[sectionKey] as Record<string, unknown>)[fieldKey];
    if (!field) return null;
    if (typeof field === "string" && field !== "not_found" && field !== "N/A") return field;
    if (typeof field === "object" && field !== null && "value" in (field as Record<string, unknown>)) {
      const val = (field as Record<string, unknown>).value;
      if (typeof val === "string" && val !== "not_found" && val !== "N/A" && val !== "") return val;
    }
    return null;
  }

  // Add dates from top-level agreement fields
  if (agreement.lease_commencement_date) {
    timelineDates.push({ label: "Lease Start", date: agreement.lease_commencement_date, type: classifyDate(agreement.lease_commencement_date) });
  }
  if (agreement.lease_expiry_date) {
    timelineDates.push({ label: "Lease Expiry", date: agreement.lease_expiry_date, type: classifyDate(agreement.lease_expiry_date) });
  }

  // Try to get additional dates from extracted data
  const loiDate = getExtractedDate("lease_term", "loi_date");
  if (loiDate) timelineDates.push({ label: "LOI Date", date: loiDate, type: classifyDate(loiDate) });

  const rentCommencement = getExtractedDate("lease_term", "rent_commencement_date");
  if (rentCommencement) timelineDates.push({ label: "Rent Start", date: rentCommencement, type: classifyDate(rentCommencement) });

  const lockInEnd = getExtractedDate("lease_term", "lock_in_end_date");
  if (lockInEnd) timelineDates.push({ label: "Lock-in End", date: lockInEnd, type: classifyDate(lockInEnd) });

  // Check for escalation dates in rent section
  const rentSection = extractedData?.rent as Record<string, unknown> | undefined;
  if (rentSection?.rent_schedule && Array.isArray(rentSection.rent_schedule)) {
    (rentSection.rent_schedule as Array<Record<string, unknown>>).forEach((item, idx) => {
      const period = item.year || item.period || item.years;
      if (typeof period === "string" && /^\d{4}-\d{2}-\d{2}/.test(period)) {
        timelineDates.push({ label: `Escalation ${idx + 1}`, date: period, type: classifyDate(period) });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/agreements">
            <Button variant="ghost" size="sm" className="gap-1 mt-0.5">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs font-medium">
                {typeLabels[agreement.type] || statusLabel(agreement.type)}
              </Badge>
              <Badge
                className={`${statusColor(agreement.status)} border-0 text-xs font-medium`}
              >
                {statusLabel(agreement.status)}
              </Badge>
              {agreement.status === "draft" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 text-xs"
                    onClick={handleExportReview}
                  >
                    <Download className="h-3 w-3" />
                    Export Review
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={handleActivate}
                    disabled={activating}
                  >
                    {activating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Rocket className="h-3 w-3" />
                    )}
                    {activating ? "Activating…" : "Activate Agreement"}
                  </Button>
                </>
              )}
              {riskFlags.length > 0 && (
                <Badge
                  className={`${
                    riskFlags.some((f) => f.severity === "high")
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-700"
                  } border-0 text-xs font-medium gap-1`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {riskFlags.length} Risk Flag
                  {riskFlags.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
                {outletName}
              </h1>
              {healthScore !== null && (
                <HealthScoreGauge score={healthScore} size="sm" showLabel={false} />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {agreement.lessor_name && (
                <>
                  <span className="font-medium text-foreground">Lessor:</span>{" "}
                  {agreement.lessor_name}
                  {" | "}
                </>
              )}
              <span className="font-medium text-foreground">Lessee:</span>{" "}
              {agreement.lessee_name || "\u2014"}
              {" | "}
              <span className="font-medium text-foreground">Document:</span>{" "}
              {agreement.document_filename}
            </p>
          </div>
        </div>
      </div>

      {/* Agreement Timeline */}
      {timelineDates.length >= 2 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="h-4 w-4 text-[#6b7280]" />
              <h3 className="text-sm font-semibold">Lease Timeline</h3>
            </div>
            <AgreementTimeline dates={timelineDates} />
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="extracted" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 max-w-2xl">
          <TabsTrigger
            value="extracted"
            className="gap-1.5 text-xs sm:text-sm"
          >
            <ClipboardList className="h-3.5 w-3.5 hidden sm:block" />
            Extracted Data
          </TabsTrigger>
          <TabsTrigger value="risks" className="gap-1.5 text-xs sm:text-sm">
            <ShieldAlert className="h-3.5 w-3.5 hidden sm:block" />
            Risk Flags
          </TabsTrigger>
          <TabsTrigger
            value="obligations"
            className="gap-1.5 text-xs sm:text-sm"
          >
            <CalendarClock className="h-3.5 w-3.5 hidden sm:block" />
            Events
          </TabsTrigger>
          <TabsTrigger
            value="document"
            className="gap-1.5 text-xs sm:text-sm"
          >
            <FileText className="h-3.5 w-3.5 hidden sm:block" />
            Document
          </TabsTrigger>
          <TabsTrigger value="qa" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="h-3.5 w-3.5 hidden sm:block" />
            Grow AI
          </TabsTrigger>
        </TabsList>

        {/* Extracted Data Tab */}
        <TabsContent value="extracted">
          {!extractedData ||
          Object.keys(extractedData).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ClipboardList className="h-10 w-10 text-[#d1d5db] mb-3" />
                <h3 className="text-base font-semibold mb-1">
                  No extracted data
                </h3>
                <p className="text-sm text-muted-foreground">
                  {agreement.extraction_status === "pending" ||
                  agreement.extraction_status === "processing"
                    ? "Data extraction is still in progress. Check back later."
                    : "No structured data has been extracted from this agreement."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Verification progress */}
              {(() => {
                let totalFields = 0;
                Object.values(extractedData).forEach((section) => {
                  if (typeof section === "object" && section !== null) {
                    totalFields += Object.keys(section as Record<string, unknown>).length;
                  }
                });
                return (
                  <div className="flex items-center gap-3 p-3 rounded-xl border bg-card">
                    <CheckSquare className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {verifiedFields.size} of {totalFields} fields verified
                      </p>
                      <div className="w-40 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${totalFields > 0 ? (verifiedFields.size / totalFields) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    {verifiedFields.size === totalFields && totalFields > 0 && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">All verified</Badge>
                    )}
                  </div>
                );
              })()}
              {/* Rent Schedule Table */}
              <RentScheduleTable agreementId={agreement.id} />

              {/* Critical Dates */}
              <CriticalDatesCard agreementId={agreement.id} />

              {Object.entries(extractedData).map(
                ([sectionKey, sectionData]) => {
                  if (
                    typeof sectionData !== "object" ||
                    sectionData === null
                  )
                    return null;
                  const fields = Object.entries(
                    sectionData as Record<string, unknown>
                  );
                  if (fields.length === 0) return null;

                  const config = sectionConfig[sectionKey] || {
                    title: formatFieldLabel(sectionKey),
                    icon: FileText,
                  };
                  const Icon = config.icon;

                  // Determine rent model badge for the rent section
                  const rentModelBadge = sectionKey === "rent" ? (() => {
                    const section = sectionData as Record<string, unknown>;
                    const rmField = section.rent_model;
                    let rm = "";
                    if (typeof rmField === "string") rm = rmField;
                    else if (typeof rmField === "object" && rmField !== null && "value" in (rmField as Record<string, unknown>)) {
                      const v = (rmField as Record<string, unknown>).value;
                      if (typeof v === "string") rm = v;
                    }
                    const labels: Record<string, string> = { fixed: "Fixed", revenue_share: "Revenue Share", hybrid_mglr: "Hybrid MGLR", percentage_only: "Percentage Only" };
                    const colors: Record<string, string> = { fixed: "bg-blue-50 text-blue-700 border-blue-200", revenue_share: "bg-emerald-50 text-emerald-700 border-emerald-200", hybrid_mglr: "bg-amber-50 text-amber-700 border-amber-200", percentage_only: "bg-slate-50 text-slate-700 border-slate-200" };
                    if (!rm || rm === "not_found") return null;
                    return (
                      <Badge className={`text-[10px] font-medium border ${colors[rm] || "bg-muted text-muted-foreground"}`}>
                        {labels[rm] || rm.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                      </Badge>
                    );
                  })() : null;

                  return (
                    <Card key={sectionKey}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className="h-4 w-4 text-[#6b7280]" />
                          <h3 className="text-sm font-semibold">
                            {config.title}
                          </h3>
                          {rentModelBadge}
                        </div>
                        {/* Rent section: show GST breakdown hint */}
                        {sectionKey === "rent" && (() => {
                          const section = sectionData as Record<string, unknown>;
                          const rmField = section.rent_model;
                          let rm = "";
                          if (typeof rmField === "string") rm = rmField;
                          else if (typeof rmField === "object" && rmField !== null && "value" in (rmField as Record<string, unknown>)) {
                            const v = (rmField as Record<string, unknown>).value;
                            if (typeof v === "string") rm = v;
                          }
                          if (rm === "hybrid_mglr") {
                            return (
                              <div className="mb-3 p-2.5 rounded-lg bg-blue-50/50 border border-blue-200 text-xs text-blue-700">
                                <span className="font-medium">Hybrid MGLR:</span> Payable rent = higher of fixed MGLR or revenue share % on actual sales. Escalation applies annually on the base rent.
                              </div>
                            );
                          }
                          if (rm === "revenue_share") {
                            return (
                              <div className="mb-3 p-2.5 rounded-lg bg-blue-50/50 border border-blue-200 text-xs text-blue-700">
                                <span className="font-medium">Revenue Share:</span> Rent is calculated as a percentage of monthly revenue, subject to any minimum base rent.
                              </div>
                            );
                          }
                          return null;
                        })()}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                          {fields.map(([fieldKey, fieldVal]) => {
                            const { displayVal, confidence } =
                              parseField(fieldVal);

                            const dotKey = `${sectionKey}.${fieldKey}`;
                            const editedVal = editedFields[dotKey];
                            const currentVal = editedVal !== undefined ? editedVal : displayVal;
                            const isVerified = verifiedFields.has(dotKey);

                            return (
                              <div key={fieldKey} className={`min-w-0 rounded-lg p-2 -mx-1 transition-colors ${isVerified ? "bg-emerald-50 ring-1 ring-emerald-200" : ""}`}>
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleFieldVerified(dotKey)}
                                    className={`flex-shrink-0 h-4 w-4 rounded border transition-colors flex items-center justify-center ${
                                      isVerified
                                        ? "bg-emerald-500 border-emerald-500 text-white"
                                        : "border-slate-300 hover:border-slate-400 bg-white"
                                    }`}
                                    title={isVerified ? "Mark as unverified" : "Mark as verified"}
                                  >
                                    {isVerified && <Check className="h-2.5 w-2.5" />}
                                  </button>
                                  <ConfidenceDot level={confidence} />
                                  <p className={`text-[11px] uppercase tracking-wide ${isVerified ? "text-emerald-700 font-medium" : "text-muted-foreground"}`}>
                                    {formatFieldLabel(fieldKey)}
                                    {isVerified && <span className="ml-1 normal-case tracking-normal font-normal text-emerald-600">verified</span>}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <EditableField
                                    value={currentVal}
                                    isNotFound={currentVal === "Not found"}
                                    onChange={(v) => handleFieldEdit(sectionKey, fieldKey, v)}
                                  />
                                  <FeedbackButton
                                    agreementId={agreementId}
                                    fieldName={dotKey}
                                    originalValue={displayVal}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
              )}
            </div>
          )}

          {/* Save / Discard bar */}
          {hasEdits && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t">
              <span className="text-xs text-muted-foreground mr-auto">
                {Object.keys(editedFields).length} field{Object.keys(editedFields).length > 1 ? "s" : ""} modified
              </span>
              <Button variant="ghost" size="sm" onClick={discardEdits} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={saveEdits} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Risk Flags Tab */}
        <TabsContent value="risks">
          {riskFlags.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ShieldAlert className="h-10 w-10 text-emerald-600 mb-3" />
                <h3 className="text-base font-semibold mb-1">
                  No Risk Flags Detected
                </h3>
                <p className="text-sm text-muted-foreground">
                  Grow AI analysis did not detect any risk flags in this
                  agreement.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {riskFlags.map((flag, idx) => (
                <Card
                  key={flag.id || flag.flag_id || idx}
                  className={`border-l-4 ${
                    flag.severity === "high"
                      ? "border-l-rose-500"
                      : "border-l-amber-400"
                  }`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 flex-shrink-0 ${
                            flag.severity === "high"
                              ? "text-rose-600"
                              : "text-amber-600"
                          }`}
                        />
                        <h3 className="text-sm font-semibold text-foreground">
                          {flag.name}
                        </h3>
                      </div>
                      <Badge
                        className={`${statusColor(flag.severity)} border-0 text-xs font-semibold`}
                      >
                        {flag.severity === "high" ? "High" : "Medium"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {flag.explanation}
                    </p>
                    {flag.clause_text && (
                      <div className="bg-muted border rounded-md p-3">
                        <p className="text-xs text-muted-foreground mb-1 font-medium">
                          Referenced Clause
                        </p>
                        <p className="text-sm text-foreground italic">
                          &ldquo;{flag.clause_text}&rdquo;
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="obligations">
          {obligations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CalendarClock className="h-10 w-10 text-[#d1d5db] mb-3" />
                <h3 className="text-base font-semibold mb-1">
                  No Events Found
                </h3>
                <p className="text-sm text-muted-foreground">
                  No payment events have been created for this agreement
                  yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted hover:bg-muted">
                      <TableHead>Type</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Due Day</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Escalation</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {obligations.map((obl) => (
                      <TableRow key={obl.id}>
                        <TableCell className="font-medium text-sm">
                          {statusLabel(obl.type)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {statusLabel(obl.frequency)}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium">
                          {obl.amount != null && obl.amount > 0
                            ? formatCurrency(obl.amount)
                            : "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {obl.due_day_of_month != null
                            ? `${obl.due_day_of_month}${getOrdinalSuffix(obl.due_day_of_month)} of month`
                            : "\u2014"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(obl.start_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(obl.end_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {obl.escalation_pct != null &&
                          obl.escalation_pct > 0
                            ? `${obl.escalation_pct}% / ${obl.escalation_frequency_years || "\u2014"} yr${(obl.escalation_frequency_years || 0) > 1 ? "s" : ""}`
                            : "\u2014"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`border-0 text-xs font-medium ${
                              obl.is_active
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-muted text-[#4a5568]"
                            }`}
                          >
                            {obl.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Document Tab */}
        <TabsContent value="document">
          <Card>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-neutral-900" />
                <span className="text-sm font-medium">
                  {agreement.document_filename}
                </span>
              </div>
              <Badge variant="outline" className="text-xs">
                {agreement.document_filename?.endsWith(".pdf") ? "PDF" : "Document"}
              </Badge>
            </div>
            <CardContent className="flex-1 p-0 bg-muted overflow-hidden">
              {agreement.document_url ? (
                <PdfViewer url={agreement.document_url} />
              ) : (
                <div className="flex-1 flex items-center justify-center py-16">
                  <div className="text-center space-y-3">
                    <FileText className="h-20 w-20 text-[#d1d5db] mx-auto" />
                    <p className="text-base font-medium text-[#6b7280]">
                      No document uploaded
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upload a document to view it here
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Grow AI Tab */}
        <TabsContent value="qa">
          <Card className="flex flex-col h-[calc(100vh-280px)] sm:h-[calc(100vh-340px)] min-h-[500px]">
            {/* Chat Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-medium">
                Ask questions about this agreement
              </span>
              <Badge variant="secondary" className="text-xs ml-auto">
                Powered by Grow AI
              </Badge>
              {chatMessages.length > 0 && (
                <button
                  onClick={clearConversation}
                  className="text-xs text-[#9ca3af] hover:text-[#4a5568] flex items-center gap-1 transition-colors"
                  title="Clear conversation"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Welcome message */}
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">
                    Grow AI
                  </p>
                  <div className="bg-muted rounded-lg rounded-tl-none p-3 max-w-[85%]">
                    <p className="text-sm">
                      I have analyzed the agreement for{" "}
                      <span className="font-semibold">{outletName}</span>.
                      You can ask me anything about the lease terms, clauses,
                      events, or any specific provisions in this
                      document.
                    </p>
                  </div>
                </div>
              </div>

              {/* Suggested questions (only show when no messages yet) */}
              {chatMessages.length === 0 && (
                <div className="flex flex-wrap gap-2 px-10">
                  {[
                    "What are the termination conditions?",
                    "Summarize the escalation terms",
                    "What is the security deposit refund policy?",
                    "What are the key events?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSendMessage(q)}
                      disabled={chatLoading}
                      className="text-xs bg-card border border-border rounded-full px-3 py-1.5 text-[#4a5568] hover:bg-muted hover:border-neutral-300 transition-colors flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3 w-3 text-[#9ca3af]" />
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Conversation */}
              {chatMessages.map((msg, i) => (
                <div key={i} className="flex items-start gap-3">
                  {msg.role === "assistant" ? (
                    <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-border flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-[#4a5568]" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                      {msg.role === "assistant" ? "Grow AI" : "You"}
                    </p>
                    <div
                      className={`rounded-lg p-3 max-w-[85%] ${
                        msg.role === "assistant"
                          ? "bg-muted rounded-tl-none"
                          : "bg-foreground text-white rounded-tr-none ml-auto"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="text-sm whitespace-pre-wrap prose prose-sm prose-neutral max-w-none [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[#4a5568] [&_blockquote]:my-2">
                          {msg.message.split("\n").map((line, li) => {
                            if (line.startsWith("> ")) {
                              return (
                                <blockquote key={li} className="border-l-2 border-neutral-300 pl-3 italic text-[#4a5568] my-2 text-[13px]">
                                  {line.slice(2)}
                                </blockquote>
                              );
                            }
                            if (line.startsWith("**") && line.endsWith("**")) {
                              return <p key={li} className="font-semibold mt-1">{line.slice(2, -2)}</p>;
                            }
                            return line ? <p key={li}>{line}</p> : <br key={li} />;
                          })}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">
                          {msg.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {chatLoading && (
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                      Grow AI
                    </p>
                    <div className="bg-muted rounded-lg rounded-tl-none p-3 max-w-[85%]">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analyzing the agreement...
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="border-t p-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Ask a question about this agreement..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={chatLoading}
                  className="flex-1"
                />
                <Button
                  onClick={() => handleSendMessage()}
                  disabled={!chatInput.trim() || chatLoading}
                  size="sm"
                  className="gap-1.5 h-9 px-4"
                >
                  {chatLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Send
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Responses are generated from the extracted agreement data
                and original document. Always verify critical information.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Utility ---

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
