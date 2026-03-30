"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CloudUpload,
  X,
  AlertTriangle,
  Shield,
  Building2,
  Calendar,
  IndianRupee,
  Scale,
  Landmark,
  Users,
  Rocket,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Eye,
  HelpCircle,
  Filter,
  CheckSquare,
  FileCheck,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadAndExtract, confirmAndActivate, createDraft, getProcessingEstimate, uploadAndExtractAsync, getExtractionJob, listOutlets } from "@/lib/api";
import { EditableField } from "@/components/editable-field";
import { FeedbackButton } from "@/components/feedback-button";
import { PageHeader } from "@/components/page-header";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(
  () => import("@/components/pdf-viewer").then((mod) => ({ default: mod.PdfViewer })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Loading PDF viewer...</div> }
);

type Confidence = "high" | "medium" | "low" | "not_found";

function ConfidenceDot({ level }: { level: Confidence }) {
  const colors: Record<Confidence, string> = {
    high: "bg-emerald-500",
    medium: "bg-amber-500",
    low: "bg-rose-400",
    not_found: "bg-slate-300",
  };
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${colors[level] || colors.not_found}`} />;
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
    .replace("Mglr", "MGLR (Min. Guaranteed Rent)")
    .replace("Tds", "TDS")
    .replace("Hybrid Mglr", "Hybrid (Fixed + Revenue Share)")
    .replace("Revenue Share", "Revenue Share (% of Sales)")
    .replace("Percentage Only", "Pure Revenue Share");
}

const sectionConfig: Record<string, { title: string; icon: React.ElementType }> = {
  parties: { title: "Parties & Entities", icon: Users },
  premises: { title: "Premises & Location", icon: Building2 },
  lease_term: { title: "Lease Term & Dates", icon: Calendar },
  rent: { title: "Rent & Revenue", icon: IndianRupee },
  charges: { title: "Charges & CAM", icon: IndianRupee },
  deposits: { title: "Security Deposits", icon: Landmark },
  legal: { title: "Legal & Compliance", icon: Scale },
  franchise: { title: "Franchise Details", icon: Building2 },
};

// Field classification for Lease vs License filtering
const LEASE_FIELDS = new Set([
  "rent", "monthly_rent", "base_rent", "rent_per_sqft", "mglr_monthly", "mglr_per_sqft",
  "rent_schedule", "rent_commencement_date", "rent_escalation_pct", "escalation_frequency_years",
  "lease_term", "lock_in_period", "lock_in_years", "lock_in_end_date",
  "lease_commencement_date", "lease_expiry_date", "lease_duration_years",
  "escalation_pct", "cam_monthly", "cam_per_sqft", "cam_escalation_pct",
  "security_deposit", "security_deposit_amount", "deposit_amount",
  "total_monthly_outflow", "revenue_share", "revenue_share_takeaway_dining", "revenue_share_online",
  "parking_slots", "parking_details", "signage_rights", "signage_approval_required",
  "marketing_charges_monthly", "marketing_charges_per_sqft",
  "force_majeure_clause", "force_majeure_details", "exclusivity_clause", "exclusivity_details",
  "co_tenancy_clause", "subleasing_allowed", "subleasing_conditions", "trading_hours", "title_clear",
]);

const LICENSE_FIELDS = new Set([
  "license_number", "licence_number", "license_no", "licence_no",
  "license_validity", "licence_validity", "validity_period",
  "license_renewal_date", "licence_renewal_date", "renewal_date",
  "issuing_authority", "licensing_authority", "issued_by",
  "license_type", "licence_type", "license_category",
  "license_expiry_date", "licence_expiry_date",
]);

type FieldFilterMode = "all" | "lease" | "license";

function fieldMatchesFilter(fieldKey: string, filter: FieldFilterMode): boolean {
  if (filter === "all") return true;
  const normalizedKey = fieldKey.toLowerCase();
  if (filter === "lease") return LEASE_FIELDS.has(normalizedKey);
  if (filter === "license") return LICENSE_FIELDS.has(normalizedKey);
  return true;
}

/**
 * Extract display value and confidence from a field.
 * Gemini returns fields as either:
 *   - { "value": "...", "confidence": "high" }  (nested object)
 *   - "plain string"
 *   - number/boolean
 *   - array of objects (e.g. rent_schedule)
 */
type ParsedField = {
  displayVal: string;
  confidence: Confidence;
  sourcePage?: number;
  sourceQuote?: string;
};

function parseField(fieldVal: unknown): ParsedField {
  if (fieldVal === null || fieldVal === undefined || fieldVal === "" || fieldVal === "not_found" || fieldVal === "N/A") {
    return { displayVal: "Not found", confidence: "not_found" };
  }

  // Handle { value, confidence, source_page, source_quote } objects from Gemini
  if (typeof fieldVal === "object" && !Array.isArray(fieldVal)) {
    const obj = fieldVal as Record<string, unknown>;
    if ("value" in obj) {
      const conf = (typeof obj.confidence === "string" ? obj.confidence : "high") as Confidence;
      const sourcePage = typeof obj.source_page === "number" ? obj.source_page : undefined;
      const sourceQuote = typeof obj.source_quote === "string" ? obj.source_quote : undefined;
      const val = obj.value;
      if (val === null || val === undefined || val === "" || val === "not_found" || val === "N/A") {
        return { displayVal: "Not found", confidence: "not_found", sourcePage, sourceQuote };
      }
      if (typeof val === "object") {
        const parsed = parseField(val);
        return { ...parsed, confidence: conf, sourcePage: sourcePage || parsed.sourcePage, sourceQuote: sourceQuote || parsed.sourceQuote };
      }
      return { displayVal: String(val), confidence: conf, sourcePage, sourceQuote };
    }
    // Generic object without value key — format as key-value pairs
    return {
      displayVal: Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(" | "),
      confidence: "high",
    };
  }

  // Handle arrays (e.g. rent_schedule)
  if (Array.isArray(fieldVal)) {
    if (fieldVal.length === 0) return { displayVal: "Not found", confidence: "not_found" };
    // Format array items nicely
    const items = fieldVal.map((item) => {
      if (typeof item === "object" && item !== null) {
        // Try to format rent schedule items
        const o = item as Record<string, unknown>;
        if (o.year || o.period || o.years || o.from_year || o.to_year) {
          const period = o.year || o.period || o.years || (o.from_year && o.to_year ? `Year ${o.from_year}-${o.to_year}` : o.from_year || o.to_year) || "";
          const rent = o.monthly_rent || o.mglr_monthly || o.rent || o.amount || "";
          const perSqft = o.rent_per_sqft || o.mglr_per_sqft || o.per_sqft || "";
          const revShare = o.revenue_share_takeaway_dining || o.revenue_share || "";
          const revOnline = o.revenue_share_online || "";
          let line = `${period}`;
          if (rent) line += `: Rs ${Number(rent).toLocaleString("en-IN")}/mo`;
          if (perSqft) line += ` (Rs ${perSqft}/sqft)`;
          if (revShare) line += ` | Rev Share: ${revShare}%`;
          if (revOnline) line += `, Online: ${revOnline}%`;
          return line;
        }
        // Format other objects as key-value pairs
        return Object.entries(o)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
          .join(" | ");
      }
      return String(item);
    });
    return { displayVal: items.join("\n"), confidence: "high" };
  }

  // Primitive
  if (typeof fieldVal === "boolean") {
    return { displayVal: fieldVal ? "Yes" : "No", confidence: "high" };
  }
  if (typeof fieldVal === "number") {
    return { displayVal: fieldVal.toLocaleString("en-IN"), confidence: "high" };
  }
  return { displayVal: String(fieldVal), confidence: "high" };
}

type ExtractionResult = {
  status: string;
  document_type: string;
  extraction: Record<string, Record<string, unknown>>;
  confidence: Record<string, string>;
  risk_flags: Array<{
    flag_id?: number;
    severity: string;
    explanation: string;
    clause_text?: string;
    name?: string;
  }>;
  filename: string;
  document_text?: string;
  document_url?: string;
  processing_duration_seconds?: number;
};

const processingSteps = [
  { label: "Uploading document", duration: 1500 },
  { label: "Scanning document content", duration: 3000 },
  { label: "Running Grow AI analysis", duration: 5000 },
  { label: "Classifying document type", duration: 3000 },
  { label: "Extracting key terms & dates", duration: 5000 },
  { label: "Analyzing financial data", duration: 4000 },
  { label: "Detecting risk flags", duration: 3000 },
];

function ProcessingStep({ fileSizeMB, fileName }: { fileSizeMB?: number; fileName?: string }) {
  const steps = processingSteps;
  const [activeStep, setActiveStep] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [backendEstimate, setBackendEstimate] = useState<{ avg: number; min: number; max: number } | null>(null);

  // Fetch real processing time estimate from backend
  useEffect(() => {
    getProcessingEstimate()
      .then((est) => {
        if (est.sample_count > 0) {
          setBackendEstimate({ avg: est.avg_seconds, min: est.min_seconds, max: est.max_seconds });
        }
      })
      .catch(() => {});
  }, []);

  // Use backend average if available, otherwise fallback to file-size heuristic
  const isImage = fileName ? /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(fileName) : false;
  const fallbackEstimate = isImage
    ? 110
    : fileSizeMB
      ? fileSizeMB < 1 ? 90
        : fileSizeMB < 3 ? 110
        : fileSizeMB < 10 ? 130
        : fileSizeMB < 30 ? 180
        : 240
      : 110;

  const estimatedTotalSec = backendEstimate ? Math.round(backendEstimate.avg) : fallbackEstimate;

  // Use real min/max from backend or derive from estimate
  const estimatedRangeLow = backendEstimate
    ? Math.round(backendEstimate.min)
    : Math.max(10, Math.round(estimatedTotalSec * 0.6));
  const estimatedRangeHigh = backendEstimate
    ? Math.round(backendEstimate.max)
    : Math.round(estimatedTotalSec * 1.3);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    function advance(index: number) {
      if (index >= steps.length) return;
      // Scale step durations proportionally to total estimate
      const totalStepDuration = steps.reduce((s, st) => s + st.duration, 0);
      const scaledDuration = (steps[index].duration / totalStepDuration) * estimatedTotalSec * 1000;
      timeout = setTimeout(() => {
        setActiveStep(index + 1);
        advance(index + 1);
      }, scaledDuration);
    }
    advance(0);
    return () => clearTimeout(timeout);
  }, [steps, estimatedTotalSec]);

  // Track elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsedSec = Math.floor(elapsedMs / 1000);
  // After estimate is exceeded, show "Taking longer than expected" instead of negative
  const isOverEstimate = elapsedSec > estimatedTotalSec;
  const remainingSec = Math.max(0, estimatedTotalSec - elapsedSec);
  const progressPct = Math.min(
    Math.max((activeStep / steps.length) * 100, (elapsedSec / estimatedTotalSec) * 95),
    99
  );

  // Stage labels for the progress
  const stageLabels = ["Uploading...", "Analyzing document type...", "Extracting data...", "Checking risk flags...", "Almost done..."];
  const currentStageIdx = activeStep < 2 ? 0 : activeStep < 4 ? 1 : activeStep < 6 ? 2 : activeStep < 7 ? 3 : 4;
  const currentStageLabel = stageLabels[currentStageIdx];

  return (
    <Card className="max-w-lg mx-auto">
      <CardContent className="pt-8 pb-10 flex flex-col items-center text-center">
        <div className="mb-6">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-foreground animate-spin" />
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-1">
          {currentStageLabel}
        </h2>
        <p className="text-sm text-muted-foreground mb-1">
          Powered by Grow AI
        </p>

        {/* Processing time estimate & live timer (Task 43) */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-[#6b7280] bg-muted px-3 py-1.5 rounded-full">
            Estimated: {estimatedRangeLow}-{estimatedRangeHigh} seconds
          </span>
          <span className="text-xs font-semibold tabular-nums bg-foreground text-white px-3 py-1.5 rounded-full">
            {elapsedSec}s elapsed
          </span>
        </div>

        {/* Remaining time hint */}
        <p className="text-xs text-[#9ca3af] mb-3">
          {isOverEstimate
            ? "Taking longer than expected, please wait..."
            : remainingSec > 0
              ? `~${Math.ceil(remainingSec / 5) * 5}s remaining`
              : "Almost done..."}
        </p>

        {/* Progress bar with percentage */}
        <div className="w-full max-w-xs mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-foreground">{currentStageLabel}</span>
            <span className="text-xs font-semibold tabular-nums">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="text-left w-full max-w-xs space-y-3">
          {steps.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${
                i < activeStep
                  ? "text-foreground"
                  : i === activeStep
                  ? "text-foreground"
                  : "text-muted-foreground opacity-40"
              }`}
            >
              {i < activeStep ? (
                <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              ) : i === activeStep ? (
                <Loader2 className="h-4 w-4 text-foreground animate-spin flex-shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-slate-300 flex-shrink-0" />
              )}
              <span className={i < activeStep ? "font-medium" : ""}>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 w-full max-w-xs">
          <p className="text-xs text-muted-foreground">
            Step {Math.min(activeStep + 1, steps.length)} of {steps.length}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function UploadAgreementPage() {
  const router = useRouter();

  // Read outlet_id from URL params (outlet-first flow)
  const [outletIdFromUrl] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("outlet_id") || null;
    }
    return null;
  });

  const [step, setStep] = useState(1);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [activationResult, setActivationResult] = useState<{
    agreement_id: number;
    outlet_id: number;
    obligations_count: number;
    alerts_count: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Split-screen review state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [pdfHighlightPage, setPdfHighlightPage] = useState<number | undefined>();
  const [pdfHighlightQuote, setPdfHighlightQuote] = useState<string | undefined>();

  const handleSourceClick = (sourcePage?: number, sourceQuote?: string) => {
    if (sourcePage) setPdfHighlightPage(sourcePage);
    if (sourceQuote) setPdfHighlightQuote(sourceQuote);
  };

  // Verification checkboxes state (tracks "sectionKey.fieldKey" strings)
  const [verifiedFields, setVerifiedFields] = useState<Set<string>>(new Set());

  // Section-by-section stepper state
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [verifiedSections, setVerifiedSections] = useState<Set<string>>(new Set());
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Get ordered section keys from extraction result
  const sectionKeys = useMemo(() => {
    if (!result?.extraction) return [];
    const preferred = ["parties", "premises", "lease_term", "rent", "charges", "deposits", "legal"];
    const keys = Object.keys(result.extraction).filter(
      (k) => typeof result.extraction[k] === "object" && result.extraction[k] !== null
    );
    return preferred.filter((k) => keys.includes(k)).concat(keys.filter((k) => !preferred.includes(k)));
  }, [result?.extraction]);

  const activeSectionKey = sectionKeys[activeSectionIndex] || "";
  const allSectionsVerified = sectionKeys.length > 0 && sectionKeys.every((k) => verifiedSections.has(k));

  const goToNextSection = () => {
    if (activeSectionIndex < sectionKeys.length - 1) {
      setActiveSectionIndex((i) => i + 1);
      setPdfHighlightPage(undefined);
      setPdfHighlightQuote(undefined);
    }
  };

  const goToPrevSection = () => {
    if (activeSectionIndex > 0) {
      setActiveSectionIndex((i) => i - 1);
      setPdfHighlightPage(undefined);
      setPdfHighlightQuote(undefined);
    }
  };

  const toggleSectionVerified = (key: string) => {
    setVerifiedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Lease vs License field filter
  const [fieldFilter, setFieldFilter] = useState<FieldFilterMode>("all");

  // Upload help section expanded state
  const [showUploadHelp, setShowUploadHelp] = useState(false);

  // Draft review mode state
  const [isDraftMode, setIsDraftMode] = useState(false);

  // Address matching — suggest linking to existing outlet (#89)
  const [matchedOutlet, setMatchedOutlet] = useState<{ id: string; name: string; city: string } | null>(null);
  const [outletLinked, setOutletLinked] = useState(false);

  // When extraction completes, try to match address to existing outlets
  useEffect(() => {
    if (!result?.extraction) return;
    const extracted = result.extraction;
    const premises = extracted?.premises || {};
    const extractedCity = String(premises?.city || "").toLowerCase().trim();
    const extractedAddress = String(premises?.full_address || premises?.property_name || "").toLowerCase().trim();
    if (!extractedCity && !extractedAddress) return;

    listOutlets({ page: 1, page_size: 200 }).then((res) => {
      const outlets = (res as { outlets?: { id: string; name: string; city?: string; address?: string }[] })?.outlets || [];
      for (const outlet of outlets) {
        const outletCity = (outlet.city || "").toLowerCase().trim();
        const outletAddr = (outlet.address || outlet.name || "").toLowerCase().trim();
        if (extractedCity && outletCity && extractedCity.includes(outletCity)) {
          if (extractedAddress && outletAddr && (extractedAddress.includes(outletAddr) || outletAddr.includes(extractedAddress.slice(0, 20)))) {
            setMatchedOutlet({ id: outlet.id, name: outlet.name, city: outlet.city || "" });
            return;
          }
        }
      }
    }).catch(() => {});
  }, [result]);

  // Create object URL for PDF viewer
  const fileUrl = useMemo(() => {
    if (selectedFile) return URL.createObjectURL(selectedFile);
    // For bulk upload results, use the document_url from the extraction result
    if (result?.document_url) return result.document_url;
    return null;
  }, [selectedFile, result]);

  // Cleanup object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  function toggleSection(sectionKey: string) {
    setCollapsedSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  }

  function expandAllSections() {
    setCollapsedSections({});
  }

  function collapseAllSections() {
    if (!result) return;
    const all: Record<string, boolean> = {};
    Object.keys(result.extraction).forEach((key) => { all[key] = true; });
    setCollapsedSections(all);
  }

  function getConfidenceBadge(level: Confidence) {
    switch (level) {
      case "high":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
            <CheckCircle2 className="h-3 w-3" />
            High
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
            <AlertTriangle className="h-3 w-3" />
            Medium
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5">
            <AlertTriangle className="h-3 w-3" />
            Low
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6b7280] bg-muted border border-border rounded-full px-1.5 py-0.5">
            <Eye className="h-3 w-3" />
            N/A
          </span>
        );
    }
  }

  // Bulk upload state
  const MAX_BULK_FILES = 10;
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkJobs, setBulkJobs] = useState<{
    id: string;
    filename: string;
    status: string;
    result?: ExtractionResult;
    error?: string;
  }[]>([]);
  const [currentBulkJobId, setCurrentBulkJobId] = useState<string | null>(null);

  // Poll bulk jobs — use ref to avoid recreating interval on every state change
  const bulkJobsRef = useRef(bulkJobs);
  bulkJobsRef.current = bulkJobs;

  const hasProcessing = bulkJobs.some((j) => j.status === "processing");

  useEffect(() => {
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      const processing = bulkJobsRef.current.filter((j) => j.status === "processing");
      for (const job of processing) {
        try {
          const data = await getExtractionJob(job.id);
          if (data.status !== "processing") {
            setBulkJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      status: data.status,
                      result: data.result,
                      error: data.error,
                    }
                  : j
              )
            );
          }
        } catch {
          // keep polling — transient network errors shouldn't stop the process
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [hasProcessing]);

  async function handleBulkUpload(files: FileList) {
    const totalFiles = Array.from(files);
    if (totalFiles.length > MAX_BULK_FILES) {
      setError(`Maximum ${MAX_BULK_FILES} files per batch. Please select fewer files.`);
      return;
    }
    if (totalFiles.length + bulkJobs.length > MAX_BULK_FILES) {
      setError(`Maximum ${MAX_BULK_FILES} files per batch. You already have ${bulkJobs.length} queued. Please select ${MAX_BULK_FILES - bulkJobs.length} or fewer files.`);
      return;
    }
    const newFiles = totalFiles.slice(0, MAX_BULK_FILES - bulkJobs.length);
    const validFiles = newFiles.filter((file) => {
      if (!isValidFile(file)) {
        setError(`Skipped "${file.name}" — unsupported type or too large.`);
        return false;
      }
      return true;
    });

    // Add files to queue immediately as "uploading"
    const tempIds: Record<string, string> = {};
    for (const file of validFiles) {
      const tempId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      tempIds[file.name] = tempId;
      setBulkJobs((prev) => [
        ...prev,
        { id: tempId, filename: file.name, status: "uploading" },
      ]);
    }

    // Upload all files in parallel
    const uploads = validFiles.map(async (file) => {
      const tempId = tempIds[file.name];
      try {
        const data = await uploadAndExtractAsync(file);
        // Replace temp "uploading" entry with real "processing" entry
        setBulkJobs((prev) =>
          prev.map((j) =>
            j.id === tempId
              ? { ...j, id: data.job_id, status: "processing" }
              : j
          )
        );
      } catch (err) {
        setBulkJobs((prev) =>
          prev.map((j) =>
            j.id === tempId
              ? { ...j, status: "failed", error: err instanceof Error ? err.message : "Upload failed" }
              : j
          )
        );
      }
    });

    await Promise.allSettled(uploads);
  }

  const validExtRegex = /\.(pdf|png|jpe?g|webp|gif|bmp|tiff?)$/i;
  const validMimeTypes = [
    "application/pdf",
    "image/png", "image/jpeg", "image/webp",
    "image/gif", "image/bmp", "image/tiff",
  ];

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  function isValidFile(file: File): boolean {
    if (file.size > MAX_FILE_SIZE) return false;
    return validMimeTypes.includes(file.type) || validExtRegex.test(file.name);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);

    const file = files[0];
    if (file && isValidFile(file)) {
      setSelectedFile(file);
      setError(null);
    } else if (file && file.size > MAX_FILE_SIZE) {
      setError(`File is too large (${formatFileSize(file.size)}). Maximum size is 50MB.`);
    } else {
      setError("Please upload a PDF or image file (PDF, PNG, JPG, WEBP, TIFF).");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleStartExtraction() {
    if (!selectedFile) return;
    setDuplicateWarning(null);

    // Check for duplicate if outlet_id is known
    if (outletIdFromUrl && selectedFile.name) {
      try {
        const { checkDuplicateAgreement } = await import("@/lib/api");
        const dup = await checkDuplicateAgreement(outletIdFromUrl, selectedFile.name);
        if (dup) {
          setDuplicateWarning(`A document named "${selectedFile.name}" already exists for this outlet. Uploading anyway.`);
        }
      } catch {
        // Skip duplicate check on error
      }
    }

    setStep(2);
    setError(null);

    try {
      const data = await uploadAndExtract(selectedFile);
      if (data.error && data.status === "partial" && Object.keys(data.extraction || {}).length === 0) {
        setError(data.error);
        setStep(1);
      } else {
        setResult(data);
        setStep(3);
        if (data.error) {
          setError(data.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed. Please try again.");
      setStep(1);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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

  // Count total verifiable fields for progress indicator
  const totalFieldCount = useMemo(() => {
    if (!result) return 0;
    let count = 0;
    Object.values(result.extraction).forEach((section) => {
      if (typeof section !== "object" || section === null) return;
      Object.keys(section as Record<string, unknown>).forEach(() => count++);
    });
    return count;
  }, [result]);

  // Count stats from extraction
  const stats = result
    ? (() => {
        let total = 0;
        let highConf = 0;
        let medConf = 0;
        let lowConf = 0;
        Object.values(result.extraction).forEach((section) => {
          if (typeof section !== "object" || section === null) return;
          Object.entries(section as Record<string, unknown>).forEach(([, val]) => {
            const { confidence } = parseField(val);
            total++;
            if (confidence === "high") highConf++;
            else if (confidence === "medium") medConf++;
            else if (confidence === "low") lowConf++;
          });
        });
        return { total, highConf, medConf, lowConf };
      })()
    : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader title="Upload Documents" description="Upload lease agreements or licence documents for AI-powered extraction" />

      {/* Step Indicator */}
      <div className="flex items-center gap-0">
        {[
          { num: 1, label: "Upload Document" },
          { num: 2, label: "Grow AI Processing" },
          { num: 3, label: isDraftMode ? "Review Draft" : "Review & Confirm" },
          { num: 4, label: isDraftMode ? "Draft Saved" : "Activated" },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold transition-colors ${
                  step > s.num
                    ? "bg-emerald-500 text-white"
                    : step === s.num
                    ? "bg-foreground text-white"
                    : "bg-border text-[#6b7280]"
                }`}
              >
                {step > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span
                className={`text-sm font-medium ${
                  step >= s.num ? "text-foreground" : "text-[#9ca3af]"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < 3 && (
              <div
                className={`mx-4 h-px w-16 ${
                  step > s.num ? "bg-emerald-500" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {duplicateWarning && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p className="text-xs flex-1">{duplicateWarning}</p>
          <Button variant="ghost" size="sm" className="p-1" onClick={() => setDuplicateWarning(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
          <Button variant="ghost" size="sm" className="p-1" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Upload Mode Toggle: Draft Review vs Full Upload */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDraftMode(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!isDraftMode ? "bg-foreground text-white" : "bg-muted text-[#4a5568] hover:bg-muted"}`}
            >
              Full Upload
            </button>
            <button
              onClick={() => setIsDraftMode(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isDraftMode ? "bg-foreground text-white" : "bg-muted text-[#4a5568] hover:bg-muted"}`}
            >
              Draft Review
            </button>
          </div>
          {isDraftMode && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50/50 text-amber-800 text-xs">
              <Eye className="h-4 w-4 flex-shrink-0" />
              Draft Review accepts lease/LOI documents only. Other documents (licenses, bills) should be uploaded via the Outlet Storage Drive.
            </div>
          )}
          {isDraftMode && false && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <FileCheck className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                <strong>Draft Review mode:</strong> Upload a draft lease for AI-powered risk analysis and term extraction. No live outlet will be created. You can review risk flags and save as draft for later.
              </p>
            </div>
          )}
          {!isDraftMode && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setBulkMode(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!bulkMode ? "bg-foreground text-white" : "bg-muted text-[#4a5568] hover:bg-muted"}`}
              >
                Single Upload
              </button>
              <button
                onClick={() => setBulkMode(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${bulkMode ? "bg-foreground text-white" : "bg-muted text-[#4a5568] hover:bg-muted"}`}
              >
                Bulk Upload (up to {MAX_BULK_FILES})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Upload Mode */}
      {step === 1 && bulkMode && !isDraftMode && (
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-4">Bulk Document Upload</h2>
              <p className="text-sm text-[#6b7280] mb-4">
                Upload up to {MAX_BULK_FILES} lease documents. Each will be processed by AI independently. After processing, review and activate each document individually.
              </p>
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif"
                className="hidden"
                ref={(el) => { if (el) (el as HTMLInputElement & { _bulk: boolean })._bulk = true; }}
                id="bulk-file-input"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) handleBulkUpload(files);
                  e.target.value = "";
                }}
              />
              <div
                className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all border-neutral-300 hover:border-neutral-400 hover:bg-muted/50"
                onClick={() => {
                  document.getElementById("bulk-file-input")?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleBulkUpload(e.dataTransfer.files);
                }}
              >
                <CloudUpload className="h-10 w-10 text-[#9ca3af] mb-3" />
                <p className="text-sm font-medium">Drop files here or click to browse</p>
                <p className="text-xs text-[#9ca3af] mt-1">
                  {bulkJobs.length}/{MAX_BULK_FILES} files queued
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Bulk job status cards */}
          {bulkJobs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Processing Queue</h3>
              {bulkJobs.map((job) => (
                <Card key={job.id} className={`overflow-hidden ${job.status === "completed" ? "border-emerald-200" : job.status === "failed" ? "border-rose-200" : "border-border"}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {job.status === "uploading" && (
                        <CloudUpload className="h-5 w-5 animate-pulse text-blue-500 flex-shrink-0" />
                      )}
                      {job.status === "processing" && (
                        <Loader2 className="h-5 w-5 animate-spin text-foreground flex-shrink-0" />
                      )}
                      {job.status === "completed" && (
                        <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                      )}
                      {job.status === "failed" && (
                        <AlertTriangle className="h-5 w-5 text-rose-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.filename}</p>
                        <p className="text-xs text-[#9ca3af]">
                          {job.status === "uploading" && "Uploading to server..."}
                          {job.status === "processing" && "AI is extracting data..."}
                          {job.status === "completed" && (
                            <>
                              Completed
                              {job.result && ` - ${job.result.document_type?.replace(/_/g, " ")}`}
                              {job.result?.risk_flags && ` - ${job.result.risk_flags.length} risk flags`}
                            </>
                          )}
                          {job.status === "failed" && (job.error || "Extraction failed")}
                        </p>
                      </div>
                      {job.status === "completed" && job.result && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs flex-shrink-0"
                          onClick={() => {
                            // Load result into the review step so user can inspect/edit before activating
                            setResult(job.result!);
                            setCurrentBulkJobId(job.id);
                            setSelectedFile(null);
                            setBulkMode(false);
                            setStep(3);
                          }}
                        >
                          Review & Activate
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (!bulkMode || isDraftMode) && (
        <div className="max-w-xl mx-auto space-y-6">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-4">Upload Document</h2>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif"
                className="hidden"
                onChange={handleFileSelect}
              />
              {!selectedFile ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-14 cursor-pointer transition-all ${
                    isDragOver
                      ? "border-black bg-muted scale-[1.01]"
                      : "border-neutral-300 hover:border-neutral-400 hover:bg-muted/50"
                  }`}
                >
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                    <CloudUpload className="h-7 w-7 text-[#9ca3af]" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Drag and drop your document here
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    or click to browse files
                  </p>
                  <Badge variant="outline" className="text-xs font-normal">PDF or image up to 50MB</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${selectedFile?.type?.startsWith("image/") ? "bg-muted" : "bg-neutral-50"}`}>
                    <FileText className={`h-5 w-5 ${selectedFile?.type?.startsWith("image/") ? "text-foreground" : "text-neutral-900"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-neutral-900"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upload Help / Instructions */}
          <Card className="border-dashed">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted transition-colors text-left"
              onClick={() => setShowUploadHelp((v) => !v)}
            >
              <HelpCircle className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
              <span className="text-sm font-medium flex-1 text-foreground">Upload Guidelines & Tips</span>
              {showUploadHelp ? (
                <ChevronUp className="h-4 w-4 text-[#9ca3af] flex-shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#9ca3af] flex-shrink-0" />
              )}
            </button>
            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                showUploadHelp ? "max-h-[600px]" : "max-h-0"
              }`}
            >
              <Separator />
              <CardContent className="pt-4 pb-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted">
                      <FileText className="h-4 w-4 text-[#6b7280] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Supported Format</p>
                        <p className="text-xs text-muted-foreground">PDF documents</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted">
                      <Shield className="h-4 w-4 text-[#6b7280] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Max File Size</p>
                        <p className="text-xs text-muted-foreground">50MB per document</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted">
                      <CloudUpload className="h-4 w-4 text-[#6b7280] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Bulk Upload</p>
                        <p className="text-xs text-muted-foreground">Up to 10 files at once</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted">
                      <Loader2 className="h-4 w-4 text-[#6b7280] mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Processing Time</p>
                        <p className="text-xs text-muted-foreground">~30-90 seconds per document</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Tips for Better Extraction</p>
                    <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
                      <li>Use clear, high-resolution scans for best results</li>
                      <li>Avoid handwritten documents -- typed or printed text works best</li>
                      <li>Ensure the document is not password-protected</li>
                      <li>Multi-page documents are supported and processed fully</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleStartExtraction}
              disabled={!selectedFile}
              className="gap-2 px-6"
            >
              Start Grow AI Extraction
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 2 && <ProcessingStep fileSizeMB={selectedFile ? selectedFile.size / (1024 * 1024) : undefined} fileName={selectedFile?.name} />}

      {/* Step 3: Review — Split-Screen Layout */}
      {step === 3 && result && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="flex items-center gap-4 p-4 rounded-xl border bg-emerald-50 border-emerald-200">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-700">Extraction Complete</p>
              <p className="text-xs text-emerald-600 flex items-center gap-2 flex-wrap">
                Classified as
                <Select
                  value={result.document_type || "unknown"}
                  onValueChange={(val) => setResult((prev) => prev ? { ...prev, document_type: val } : prev)}
                >
                  <SelectTrigger className="h-6 w-auto inline-flex text-xs font-semibold text-emerald-700 border-emerald-300 bg-white px-2 py-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["lease_loi", "license_certificate", "franchise_agreement", "bill", "supplementary_agreement"].map((t) => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stats && <> &middot; {stats.total} fields extracted &middot; {stats.highConf} high confidence</>}
                {result.processing_duration_seconds != null && (
                  <> &middot; Processed in {result.processing_duration_seconds}s</>
                )}
                {(result as Record<string, unknown>)?.extraction_method === "vision" && (
                  <Badge variant="outline" className="ml-2 text-[10px]">GroSpace Vision AI</Badge>
                )}
              </p>
            </div>
            <Badge variant="outline" className="text-xs flex-shrink-0 hidden sm:inline-flex">{result.filename}</Badge>
          </div>

          {/* Address match suggestion (#89) */}
          {matchedOutlet && !outletLinked && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50/50">
              <MapPin className="h-4 w-4 text-blue-600 shrink-0" />
              <p className="text-sm text-blue-700 flex-1">
                This document may belong to <strong>{matchedOutlet.name}</strong> ({matchedOutlet.city}).
              </p>
              <Button size="sm" variant="outline" className="text-xs border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setOutletLinked(true)}>
                Link to Outlet
              </Button>
            </div>
          )}
          {outletLinked && matchedOutlet && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-700">Linked to <strong>{matchedOutlet.name}</strong></p>
            </div>
          )}

          {/* Stats bar */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg border bg-card">
                <p className="text-2xl font-semibold font-mono tracking-tighter">{stats.total}</p>
                <p className="text-[11px] text-muted-foreground">Fields Extracted</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-card">
                <p className="text-2xl font-bold text-emerald-600">{stats.highConf}</p>
                <p className="text-[11px] text-muted-foreground">High Confidence</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-card">
                <p className="text-2xl font-bold text-amber-600">{stats.medConf + stats.lowConf}</p>
                <p className="text-[11px] text-muted-foreground">Needs Review</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-card">
                <p className="text-2xl font-bold text-rose-600">{result.risk_flags.length}</p>
                <p className="text-[11px] text-muted-foreground">Risk Flags</p>
              </div>
            </div>
          )}

          {/* Section Stepper Navigation */}
          <div className="p-3 rounded-xl border bg-card space-y-3">
            {/* Section progress dots */}
            <div className="flex items-center gap-1 justify-center">
              {sectionKeys.map((key, idx) => {
                const isActive = idx === activeSectionIndex;
                const isVerified = verifiedSections.has(key);
                const conf = sectionConfig[key] || { title: formatFieldLabel(key), icon: FileText };
                return (
                  <button
                    key={key}
                    onClick={() => { setActiveSectionIndex(idx); setPdfHighlightPage(undefined); setPdfHighlightQuote(undefined); }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                      isActive
                        ? "bg-foreground text-white shadow-sm"
                        : isVerified
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    title={conf.title}
                  >
                    {isVerified && !isActive && <Check className="h-2.5 w-2.5" />}
                    <span className="hidden sm:inline">{conf.title.split(" ")[0]}</span>
                    <span className="sm:hidden">{idx + 1}</span>
                  </button>
                );
              })}
            </div>
            {/* Section progress bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${sectionKeys.length > 0 ? (verifiedSections.size / sectionKeys.length) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                {verifiedSections.size}/{sectionKeys.length} sections verified
              </span>
            </div>
          </div>

          {/* OLD: Verification Progress — hidden, replaced by stepper */}
          <div className="hidden flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border bg-card">
            <div className="flex items-center gap-3">
              <CheckSquare className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {verifiedFields.size} of {totalFieldCount} fields verified
                </p>
                <div className="w-40 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${totalFieldCount > 0 ? (verifiedFields.size / totalFieldCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
              {verifiedFields.size === totalFieldCount && totalFieldCount > 0 && (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">All verified</Badge>
              )}
            </div>

            {/* Lease vs License filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-[#9ca3af]" />
              <span className="text-xs text-muted-foreground mr-1">Filter:</span>
              {(["all", "lease", "license"] as FieldFilterMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFieldFilter(mode)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    fieldFilter === mode
                      ? "bg-foreground text-white"
                      : "bg-muted text-[#4a5568] hover:bg-muted/80"
                  }`}
                >
                  {mode === "all" ? "All" : mode === "lease" ? "Lease" : "License"}
                </button>
              ))}
            </div>
          </div>

          {/* Split-Screen: PDF Viewer (left) + Extracted Fields (right) */}
          <div className="flex flex-col lg:flex-row gap-5 lg:gap-6">
            {/* LEFT SIDE: PDF Viewer */}
            <div className="w-full lg:w-1/2 lg:sticky lg:top-4 lg:self-start">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted border-b">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#6b7280]" />
                    <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                      {result.filename}
                    </span>
                  </div>
                  {pdfHighlightQuote && (
                    <button
                      onClick={() => { setPdfHighlightPage(undefined); setPdfHighlightQuote(undefined); }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100"
                    >
                      Clear highlight
                    </button>
                  )}
                </div>
                <div style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}>
                  {fileUrl && (selectedFile?.type === "application/pdf" || (!selectedFile && result?.filename?.toLowerCase().endsWith(".pdf"))) ? (
                    <PdfViewer
                      url={fileUrl}
                      activePage={pdfHighlightPage}
                      highlightQuote={pdfHighlightQuote}
                    />
                  ) : fileUrl && (selectedFile?.type?.startsWith("image/") || (!selectedFile && /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(result?.filename || ""))) ? (
                    <div className="flex items-center justify-center p-4 h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fileUrl}
                        alt="Uploaded document"
                        className="max-w-full object-contain"
                        style={{
                          transform: "scale(1)",
                          transformOrigin: "top center",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[#9ca3af]">
                      <FileText className="h-12 w-12 mb-3" />
                      <p className="text-sm font-medium">Preview not available</p>
                      <p className="text-xs mt-1">The uploaded document cannot be previewed in the browser.</p>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* RIGHT SIDE: Extracted Fields with Collapsible Sections */}
            <div className="w-full lg:w-1/2 space-y-3">
              {/* Section controls */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Extracted Data</h2>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={expandAllSections}>
                    Expand All
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={collapseAllSections}>
                    Collapse All
                  </Button>
                </div>
              </div>

              {/* Risk Flags Section (collapsible) */}
              {result.risk_flags.length > 0 && (
                <Card className="overflow-hidden border-rose-200">
                  <button
                    className="w-full flex items-center gap-2 px-4 py-3 bg-rose-50/50 hover:bg-rose-50 transition-colors text-left"
                    onClick={() => toggleSection("_risk_flags")}
                  >
                    <Shield className="h-4 w-4 text-rose-600 flex-shrink-0" />
                    <span className="text-sm font-semibold flex-1">Risk Flags</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-rose-200 text-rose-700 mr-1"
                    >
                      {result.risk_flags.length}
                    </Badge>
                    {collapsedSections["_risk_flags"] ? (
                      <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-[#9ca3af]" />
                    )}
                  </button>
                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${
                      collapsedSections["_risk_flags"] ? "max-h-0" : "max-h-[2000px]"
                    }`}
                  >
                    <CardContent className="pt-3 pb-3 space-y-2">
                      {result.risk_flags.map((flag, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-lg border ${
                            flag.severity === "high"
                              ? "border-rose-200 bg-rose-50/50"
                              : "border-amber-200 bg-amber-50/50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <AlertTriangle
                              className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${
                                flag.severity === "high" ? "text-rose-600" : "text-amber-600"
                              }`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-medium">{flag.name || flag.explanation}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 ${
                                    flag.severity === "high"
                                      ? "border-rose-200 text-rose-700"
                                      : "border-amber-200 text-amber-700"
                                  }`}
                                >
                                  {flag.severity}
                                </Badge>
                              </div>
                              {flag.explanation && flag.name && (
                                <p className="text-[11px] text-muted-foreground">{flag.explanation}</p>
                              )}
                              {flag.clause_text && (
                                <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-2">
                                  &ldquo;{flag.clause_text}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </div>
                </Card>
              )}

              {/* Extracted Data — Section-by-Section Stepper */}
              {sectionKeys.filter((k) => k === activeSectionKey).map((sectionKey) => {
                const sectionData = result.extraction[sectionKey];
                if (typeof sectionData !== "object" || sectionData === null) return null;
                const allFields = Object.entries(sectionData as Record<string, unknown>);
                // Apply field filter
                const fields = fieldFilter === "all"
                  ? allFields
                  : allFields.filter(([key]) => fieldMatchesFilter(key, fieldFilter));
                if (fields.length === 0) return null;

                const config = sectionConfig[sectionKey] || {
                  title: formatFieldLabel(sectionKey),
                  icon: FileText,
                };
                const Icon = config.icon;
                const isCollapsed = !!collapsedSections[sectionKey];

                // Count confidence levels in this section
                const sectionStats = fields.reduce(
                  (acc, [, val]) => {
                    const { confidence } = parseField(val);
                    acc.total++;
                    if (confidence === "high") acc.high++;
                    else if (confidence === "medium") acc.medium++;
                    else if (confidence === "low") acc.low++;
                    return acc;
                  },
                  { total: 0, high: 0, medium: 0, low: 0 }
                );

                return (
                  <Card key={sectionKey} className="overflow-hidden">
                    {/* Section Header (clickable to toggle) */}
                    <button
                      className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted transition-colors text-left"
                      onClick={() => toggleSection(sectionKey)}
                    >
                      <Icon className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
                      <span className="text-sm font-semibold flex-1">{config.title}</span>
                      <div className="flex items-center gap-1.5 mr-1">
                        {sectionStats.high > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {sectionStats.high}
                          </span>
                        )}
                        {sectionStats.medium > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {sectionStats.medium}
                          </span>
                        )}
                        {sectionStats.low > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                            {sectionStats.low}
                          </span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] mr-1">
                        {fields.length} {fields.length === 1 ? "field" : "fields"}
                      </Badge>
                      {isCollapsed ? (
                        <ChevronDown className="h-4 w-4 text-[#9ca3af] flex-shrink-0" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-[#9ca3af] flex-shrink-0" />
                      )}
                    </button>

                    {/* Section Body (collapsible) */}
                    <div
                      className={`transition-all duration-300 ease-in-out overflow-hidden ${
                        isCollapsed ? "max-h-0" : "max-h-[5000px]"
                      }`}
                    >
                      <Separator />
                      <CardContent className="pt-3 pb-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                          {fields.map(([fieldKey, fieldVal]) => {
                            const { displayVal, confidence } = parseField(fieldVal);
                            const isNotFound = displayVal === "Not found";
                            const isCurrency = /rent|deposit|cam_monthly|outflow|amount|revenue/.test(fieldKey);
                            const isArea = /area|sqft/.test(fieldKey);
                            const isPct = /percentage|pct|escalation_pct/.test(fieldKey);
                            const isDate = /date|commencement|expiry/.test(fieldKey);
                            const isBool = displayVal === "Yes" || displayVal === "No";
                            const isMultiLine = displayVal.includes("\n");

                            let formattedVal = displayVal;
                            if (!isNotFound && isCurrency && !isNaN(Number(displayVal.replace(/,/g, "")))) {
                              formattedVal = `₹${Number(displayVal.replace(/,/g, "")).toLocaleString("en-IN")}`;
                            } else if (!isNotFound && isArea && !isNaN(Number(displayVal.replace(/,/g, "")))) {
                              formattedVal = `${Number(displayVal.replace(/,/g, "")).toLocaleString("en-IN")} sq ft`;
                            } else if (!isNotFound && isPct && !isNaN(Number(displayVal))) {
                              formattedVal = `${displayVal}%`;
                            } else if (!isNotFound && isDate && /^\d{4}-\d{2}-\d{2}$/.test(displayVal)) {
                              formattedVal = new Date(displayVal).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                            }

                            const fieldPath = `${sectionKey}.${fieldKey}`;
                            const isVerified = verifiedFields.has(fieldPath);
                            const { sourcePage, sourceQuote } = parseField(fieldVal);

                            return (
                              <div key={fieldKey} className={`min-w-0 group/field rounded-lg p-2.5 -mx-1 transition-colors ${isNotFound ? "opacity-50" : "hover:bg-muted"} ${isVerified ? "bg-emerald-50 ring-1 ring-emerald-200" : ""}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  {/* Verification checkbox */}
                                  <button
                                    type="button"
                                    onClick={() => toggleFieldVerified(fieldPath)}
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
                                  <p className={`text-[10px] uppercase tracking-wider font-semibold flex-1 ${isVerified ? "text-emerald-700" : "text-[#9ca3af]"}`}>
                                    {formatFieldLabel(fieldKey)}
                                    {isVerified && <span className="ml-1 normal-case tracking-normal font-normal text-emerald-600">verified</span>}
                                  </p>
                                  {sourcePage && (
                                    <button
                                      type="button"
                                      onClick={() => handleSourceClick(sourcePage, sourceQuote)}
                                      className="opacity-0 group-hover/field:opacity-100 transition-opacity text-[10px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100"
                                      title={sourceQuote ? `Source: "${sourceQuote.slice(0, 60)}..."` : `Found on page ${sourcePage}`}
                                    >
                                      <FileText className="h-2.5 w-2.5" />
                                      Pg {sourcePage}
                                    </button>
                                  )}
                                  <span className="opacity-0 group-hover/field:opacity-100 transition-opacity">
                                    {getConfidenceBadge(confidence)}
                                  </span>
                                  <FeedbackButton
                                    agreementId={result.filename}
                                    fieldName={fieldPath}
                                    originalValue={displayVal}
                                  />
                                </div>
                                {isNotFound ? (
                                  <EditableField
                                    value=""
                                    displayValue="Not found in document"
                                    isNotFound={true}
                                    onChange={(newVal) => {
                                      setResult((prev) => {
                                        if (!prev) return prev;
                                        const updated = { ...prev, extraction: { ...prev.extraction } };
                                        const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                        const existing = section[fieldKey];
                                        if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                          section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal };
                                        } else {
                                          section[fieldKey] = newVal;
                                        }
                                        updated.extraction[sectionKey] = section;
                                        return updated;
                                      });
                                    }}
                                  />
                                ) : isBool ? (
                                  <div className="pl-4">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newVal = displayVal === "Yes" ? "No" : "Yes";
                                        setResult((prev) => {
                                          if (!prev) return prev;
                                          const updated = { ...prev, extraction: { ...prev.extraction } };
                                          const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                          const existing = section[fieldKey];
                                          if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                            section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal === "Yes" };
                                          } else {
                                            section[fieldKey] = newVal === "Yes";
                                          }
                                          updated.extraction[sectionKey] = section;
                                          return updated;
                                        });
                                      }}
                                      className="cursor-pointer hover:opacity-80 transition-opacity"
                                      title="Click to toggle"
                                    >
                                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${displayVal === "Yes" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                        {displayVal === "Yes" ? "✓" : "✗"} {displayVal}
                                      </span>
                                    </button>
                                  </div>
                                ) : isMultiLine && Array.isArray(
                                  (() => {
                                    const sec = result.extraction[sectionKey] as Record<string, unknown>;
                                    const raw = sec[fieldKey];
                                    if (typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>)) {
                                      return (raw as Record<string, unknown>).value;
                                    }
                                    return raw;
                                  })()
                                ) ? (
                                  <div className="pl-4 space-y-1 mt-1">
                                    {(() => {
                                      const sec = result.extraction[sectionKey] as Record<string, unknown>;
                                      const raw = sec[fieldKey];
                                      const arrVal = (typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>))
                                        ? (raw as Record<string, unknown>).value as unknown[]
                                        : raw as unknown[];
                                      return arrVal.map((item, idx) => {
                                        const { displayVal: itemDisplay } = parseField(item);
                                        return (
                                          <div key={idx} className="flex items-start gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-foreground mt-1.5 flex-shrink-0" />
                                            <EditableField
                                              value={itemDisplay}
                                              isNotFound={false}
                                              onChange={(newVal) => {
                                                setResult((prev) => {
                                                  if (!prev) return prev;
                                                  const updated = { ...prev, extraction: { ...prev.extraction } };
                                                  const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                                  const existing = section[fieldKey];
                                                  let arr: unknown[];
                                                  if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                                    arr = [...((existing as Record<string, unknown>).value as unknown[])];
                                                    arr[idx] = newVal;
                                                    section[fieldKey] = { ...(existing as Record<string, unknown>), value: arr };
                                                  } else {
                                                    arr = [...(existing as unknown[])];
                                                    arr[idx] = newVal;
                                                    section[fieldKey] = arr;
                                                  }
                                                  updated.extraction[sectionKey] = section;
                                                  return updated;
                                                });
                                              }}
                                            />
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                ) : isMultiLine ? (
                                  <EditableField
                                    value={displayVal}
                                    isNotFound={false}
                                    multiline
                                    onChange={(newVal) => {
                                      setResult((prev) => {
                                        if (!prev) return prev;
                                        const updated = { ...prev, extraction: { ...prev.extraction } };
                                        const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                        const existing = section[fieldKey];
                                        if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                          section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal };
                                        } else {
                                          section[fieldKey] = newVal;
                                        }
                                        updated.extraction[sectionKey] = section;
                                        return updated;
                                      });
                                    }}
                                  />
                                ) : (
                                  <EditableField
                                    value={displayVal}
                                    displayValue={formattedVal !== displayVal ? formattedVal : undefined}
                                    isNotFound={false}
                                    onChange={(newVal) => {
                                      setResult((prev) => {
                                        if (!prev) return prev;
                                        const updated = { ...prev, extraction: { ...prev.extraction } };
                                        const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                        const existing = section[fieldKey];
                                        if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                          section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal };
                                        } else {
                                          section[fieldKey] = newVal;
                                        }
                                        updated.extraction[sectionKey] = section;
                                        return updated;
                                      });
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Section Verification + Navigation */}
          <div className="flex items-center justify-between p-3 rounded-xl border bg-card">
            <Button
              variant="ghost"
              size="sm"
              disabled={activeSectionIndex === 0}
              onClick={goToPrevSection}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            <div className="flex items-center gap-3">
              {/* Section verification checkbox */}
              <button
                type="button"
                onClick={() => toggleSectionVerified(activeSectionKey)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors text-xs font-medium ${
                  verifiedSections.has(activeSectionKey)
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className={`h-4 w-4 rounded border flex items-center justify-center ${
                  verifiedSections.has(activeSectionKey)
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-slate-300"
                }`}>
                  {verifiedSections.has(activeSectionKey) && <Check className="h-2.5 w-2.5" />}
                </span>
                I have verified this section
              </button>
            </div>

            {activeSectionIndex < sectionKeys.length - 1 ? (
              <Button
                size="sm"
                onClick={goToNextSection}
                disabled={!verifiedSections.has(activeSectionKey)}
                className="gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <div /> /* spacer for last section */
            )}
          </div>

          {/* Action Bar */}
          <Separator />
          <div className="flex items-center justify-between py-2">
            <Button
              variant={bulkJobs.length > 0 ? "outline" : "ghost"}
              onClick={() => {
                setStep(1);
                setResult(null);
                setSelectedFile(null);
                setError(null);
                setCurrentBulkJobId(null);
                setActiveSectionIndex(0);
                setVerifiedSections(new Set());
                if (bulkJobs.length > 0) {
                  setBulkMode(true);
                }
              }}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              {bulkJobs.length > 0 ? `Back to Queue (${bulkJobs.filter(j => j.status === "completed" && j.result).length} ready)` : "Upload Another"}
            </Button>
            <div className="flex items-center gap-3">
              <Button
                disabled={isConfirming || !allSectionsVerified}
                onClick={async () => {
                  if (!allSectionsVerified) return;
                  setShowConfirmDialog(true);
                }}
                className="gap-2 px-6"
                title={allSectionsVerified ? "" : `Verify all ${sectionKeys.length} sections before proceeding`}
              >
                <Rocket className="h-4 w-4" />
                {isDraftMode ? "Save Draft" : "Confirm & Activate"}
                {!allSectionsVerified && (
                  <Badge variant="outline" className="text-[9px] ml-1">{verifiedSections.size}/{sectionKeys.length}</Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Confirmation Dialog */}
          {showConfirmDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <Card className="max-w-md mx-4">
                <CardContent className="pt-6 pb-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <Eye className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Final Confirmation</p>
                      <p className="text-xs text-muted-foreground">Have you verified all extracted fields?</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You have verified {verifiedSections.size} of {sectionKeys.length} sections.
                    Once activated, this data will create an outlet and agreement in your portfolio.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)}>
                      Go Back & Review
                    </Button>
                    <Button
                      size="sm"
                      disabled={isConfirming}
                      onClick={async () => {
                        setShowConfirmDialog(false);
                  if (!result) return;
                  setIsConfirming(true);
                  setError(null);
                  try {
                    if (isDraftMode) {
                      const res = await createDraft({
                        extraction: result.extraction,
                        document_type: result.document_type,
                        risk_flags: result.risk_flags,
                        confidence: result.confidence,
                        filename: result.filename,
                        document_text: result.document_text,
                        document_url: result.document_url,
                      });
                      setActivationResult(res);
                      if (currentBulkJobId) {
                        setBulkJobs(prev => prev.filter(j => j.id !== currentBulkJobId));
                        setCurrentBulkJobId(null);
                      }
                      setStep(4);
                    } else {
                      const res = await confirmAndActivate({
                        extraction: result.extraction,
                        document_type: result.document_type,
                        risk_flags: result.risk_flags,
                        confidence: result.confidence,
                        filename: result.filename,
                        document_text: result.document_text,
                        document_url: result.document_url,
                      });
                      setActivationResult(res);
                      // Remove activated job from bulk queue
                      if (currentBulkJobId) {
                        setBulkJobs(prev => prev.filter(j => j.id !== currentBulkJobId));
                        setCurrentBulkJobId(null);
                      }
                      setStep(4);
                    }
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : isDraftMode ? "Failed to save draft. Please try again." : "Activation failed. Please try again."
                    );
                  } finally {
                    setIsConfirming(false);
                  }
                }}
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isDraftMode ? "Saving..." : "Activating..."}
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Yes, {isDraftMode ? "Save Draft" : "Confirm & Activate"}
                  </>
                )}
              </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Activated */}
      {step === 4 && activationResult && (
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
            <div className="mb-6">
              <div className="h-20 w-20 rounded-full bg-emerald-50 flex items-center justify-center">
                <Check className="h-10 w-10 text-emerald-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-2">{isDraftMode ? "Draft Saved!" : "Agreement Activated!"}</h2>
            <p className="text-sm text-muted-foreground mb-8">
              {isDraftMode
                ? "Your draft has been saved. You can find it in Agreements with 'Draft' status."
                : `${activationResult.obligations_count} events and ${activationResult.alerts_count} reminders have been auto-generated`}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
              <Button
                className="w-full gap-2"
                onClick={() =>
                  router.push(`/agreements/${activationResult.agreement_id}`)
                }
              >
                View {isDraftMode ? "Draft" : "Agreement"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              {!isDraftMode && <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() =>
                  router.push(`/outlets/${activationResult.outlet_id}`)
                }
              >
                View Outlet
                <ArrowRight className="h-4 w-4" />
              </Button>}
            </div>

            {bulkJobs.filter(j => j.status === "completed" && j.result).length > 0 ? (
              <Button
                variant="default"
                className="mt-4 gap-2 w-full max-w-sm"
                onClick={() => {
                  setStep(1);
                  setResult(null);
                  setSelectedFile(null);
                  setActivationResult(null);
                  setError(null);
                  setBulkMode(true);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Queue ({bulkJobs.filter(j => j.status === "completed" && j.result).length} remaining)
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="mt-4 gap-1"
                onClick={() => {
                  setStep(1);
                  setResult(null);
                  setSelectedFile(null);
                  setActivationResult(null);
                  setError(null);
                  if (bulkJobs.length > 0) {
                    setBulkMode(true);
                  }
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                {bulkJobs.length > 0 ? "Back to Queue" : "Upload Another"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
