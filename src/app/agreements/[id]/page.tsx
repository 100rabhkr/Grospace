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
import { getAgreement, askDocumentQuestion } from "@/lib/api";

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
    low: "bg-red-500",
    not_found: "bg-neutral-300",
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
        return { displayVal: JSON.stringify(val), confidence: conf };
      }
      return { displayVal: String(val), confidence: conf };
    }
    return { displayVal: JSON.stringify(obj), confidence: "high" };
  }

  if (Array.isArray(fieldVal)) {
    if (fieldVal.length === 0)
      return { displayVal: "Not found", confidence: "not_found" };
    const items = fieldVal.map((item) => {
      if (typeof item === "object" && item !== null) {
        const o = item as Record<string, unknown>;
        if (o.year || o.period || o.years) {
          const period = o.year || o.period || o.years || "";
          const rent = o.monthly_rent || o.rent || o.amount || "";
          const perSqft = o.rent_per_sqft || o.per_sqft || "";
          let line = `${period}`;
          if (rent)
            line += `: Rs ${Number(rent).toLocaleString("en-IN")}/mo`;
          if (perSqft) line += ` (Rs ${perSqft}/sqft)`;
          return line;
        }
        return Object.values(o).join(" | ");
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
  if (!status) return "bg-neutral-100 text-neutral-600";
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    expiring: "bg-orange-100 text-orange-800",
    expired: "bg-red-100 text-red-800",
    terminated: "bg-red-100 text-red-800",
    draft: "bg-neutral-100 text-neutral-600",
    renewed: "bg-teal-100 text-teal-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    review: "bg-amber-100 text-amber-800",
    processing: "bg-blue-100 text-blue-800",
    pending: "bg-neutral-100 text-neutral-600",
    failed: "bg-red-100 text-red-800",
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-blue-100 text-blue-700",
  };
  return map[status] || "bg-neutral-100 text-neutral-600";
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
        <div className="h-9 w-16 bg-neutral-200 rounded animate-pulse" />
        <div className="space-y-2 flex-1">
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-neutral-200 rounded animate-pulse" />
            <div className="h-5 w-16 bg-neutral-200 rounded animate-pulse" />
          </div>
          <div className="h-7 w-64 bg-neutral-200 rounded animate-pulse" />
          <div className="h-4 w-96 bg-neutral-200 rounded animate-pulse" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-full max-w-2xl bg-neutral-200 rounded animate-pulse" />

      {/* Content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-5 w-32 bg-neutral-200 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j}>
                    <div className="h-3 w-20 bg-neutral-200 rounded animate-pulse mb-1" />
                    <div className="h-4 w-40 bg-neutral-200 rounded animate-pulse" />
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
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  async function handleSendMessage() {
    if (!chatInput.trim() || chatLoading) return;

    const question = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [
      ...prev,
      { role: "user", message: question },
    ]);
    setChatLoading(true);

    try {
      const response = await askDocumentQuestion(agreementId, question);
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

  // --- Loading State ---
  if (loading) {
    return <DetailSkeleton />;
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertTriangle className="h-12 w-12 text-red-400" />
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
        <FileText className="h-12 w-12 text-neutral-300" />
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
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
              {riskFlags.length > 0 && (
                <Badge
                  className={`${
                    riskFlags.some((f) => f.severity === "high")
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  } border-0 text-xs font-medium gap-1`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {riskFlags.length} Risk Flag
                  {riskFlags.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {outletName}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {agreement.lessor_name && (
                <>
                  <span className="font-medium text-black">Lessor:</span>{" "}
                  {agreement.lessor_name}
                  {" | "}
                </>
              )}
              <span className="font-medium text-black">Lessee:</span>{" "}
              {agreement.lessee_name || "\u2014"}
              {" | "}
              <span className="font-medium text-black">Document:</span>{" "}
              {agreement.document_filename}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="extracted" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
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
            Obligations
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
            Q&A
          </TabsTrigger>
        </TabsList>

        {/* Extracted Data Tab */}
        <TabsContent value="extracted">
          {!extractedData ||
          Object.keys(extractedData).length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ClipboardList className="h-10 w-10 text-neutral-300 mb-3" />
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

                  return (
                    <Card key={sectionKey}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className="h-4 w-4 text-neutral-500" />
                          <h3 className="text-sm font-semibold">
                            {config.title}
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                          {fields.map(([fieldKey, fieldVal]) => {
                            const { displayVal, confidence } =
                              parseField(fieldVal);

                            return (
                              <div key={fieldKey} className="min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <ConfidenceDot level={confidence} />
                                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                    {formatFieldLabel(fieldKey)}
                                  </p>
                                </div>
                                <p
                                  className={`text-sm font-medium leading-snug ${
                                    displayVal === "Not found"
                                      ? "text-neutral-400 italic"
                                      : "text-black"
                                  }`}
                                >
                                  {displayVal.includes("\n")
                                    ? displayVal
                                        .split("\n")
                                        .map((line, i) => (
                                          <span key={i} className="block">
                                            {line}
                                          </span>
                                        ))
                                    : displayVal}
                                </p>
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
        </TabsContent>

        {/* Risk Flags Tab */}
        <TabsContent value="risks">
          {riskFlags.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <ShieldAlert className="h-10 w-10 text-emerald-400 mb-3" />
                <h3 className="text-base font-semibold mb-1">
                  No Risk Flags Detected
                </h3>
                <p className="text-sm text-muted-foreground">
                  The AI analysis did not detect any risk flags in this
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
                      ? "border-l-red-500"
                      : "border-l-amber-500"
                  }`}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 flex-shrink-0 ${
                            flag.severity === "high"
                              ? "text-red-600"
                              : "text-amber-600"
                          }`}
                        />
                        <h3 className="text-sm font-semibold text-black">
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
                      <div className="bg-neutral-50 border rounded-md p-3">
                        <p className="text-xs text-muted-foreground mb-1 font-medium">
                          Referenced Clause
                        </p>
                        <p className="text-sm text-black italic">
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

        {/* Obligations Tab */}
        <TabsContent value="obligations">
          {obligations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CalendarClock className="h-10 w-10 text-neutral-300 mb-3" />
                <h3 className="text-base font-semibold mb-1">
                  No Obligations Found
                </h3>
                <p className="text-sm text-muted-foreground">
                  No payment obligations have been created for this agreement
                  yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
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
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-neutral-100 text-neutral-600"
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
          <Card className="min-h-[500px] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">
                  {agreement.document_filename}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  PDF
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                >
                  Download
                </Button>
              </div>
            </div>
            <CardContent className="flex-1 flex items-center justify-center bg-neutral-50">
              <div className="text-center space-y-3">
                <FileText className="h-20 w-20 text-neutral-300 mx-auto" />
                <div>
                  <p className="text-base font-medium text-neutral-500">
                    PDF Viewer
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The original agreement document will be rendered here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {agreement.document_filename}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Q&A Tab */}
        <TabsContent value="qa">
          <Card className="flex flex-col h-[calc(100vh-340px)] min-h-[500px]">
            {/* Chat Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm font-medium">
                Ask questions about this agreement
              </span>
              <Badge variant="secondary" className="text-xs ml-auto">
                AI-Powered
              </Badge>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Welcome message */}
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">
                    GroSpace AI
                  </p>
                  <div className="bg-neutral-100 rounded-lg rounded-tl-none p-3 max-w-[85%]">
                    <p className="text-sm">
                      I have analyzed the agreement for{" "}
                      <span className="font-semibold">{outletName}</span>.
                      You can ask me anything about the lease terms, clauses,
                      obligations, or any specific provisions in this
                      document.
                    </p>
                  </div>
                </div>
              </div>

              {/* Conversation */}
              {chatMessages.map((msg, i) => (
                <div key={i} className="flex items-start gap-3">
                  {msg.role === "assistant" ? (
                    <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-neutral-600" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                      {msg.role === "assistant" ? "GroSpace AI" : "You"}
                    </p>
                    <div
                      className={`rounded-lg p-3 max-w-[85%] ${
                        msg.role === "assistant"
                          ? "bg-neutral-100 rounded-tl-none"
                          : "bg-black text-white rounded-tr-none ml-auto"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {chatLoading && (
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">
                      GroSpace AI
                    </p>
                    <div className="bg-neutral-100 rounded-lg rounded-tl-none p-3 max-w-[85%]">
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
                  onClick={handleSendMessage}
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
