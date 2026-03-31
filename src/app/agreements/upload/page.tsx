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
  Clock,
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
  FileCheck,
  MapPin,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { confirmAndActivate, createDraft, getProcessingEstimate, getExtractionJob, uploadAndExtractAsync, listOutlets } from "@/lib/api";
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
  file_hash?: string;
  processing_duration_seconds?: number;
  existing_agreement_id?: string;
  existing_status?: string;
  message?: string;
  ocr_pages?: Array<{
    page_number: number;
    width: number;
    height: number;
    words: Array<{ text: string; bbox: { x: number; y: number; w: number; h: number } }>;
  }> | null;
};

const processingSteps = [
  { label: "Uploading document", duration: 1500 },
  { label: "Scanning document content", duration: 3000 },
  { label: "Running Gro AI analysis", duration: 5000 },
  { label: "Classifying document type", duration: 3000 },
  { label: "Extracting key terms & dates", duration: 5000 },
  { label: "Analyzing financial data", duration: 4000 },
  { label: "Detecting risk flags", duration: 3000 },
];

function ProcessingStep({ fileSizeMB, fileName }: { fileSizeMB?: number; fileName?: string }) {
  const steps = processingSteps;
  const [activeStep, setActiveStep] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [backendEstimate, setBackendEstimate] = useState<{ avg: number; min: number; max: number } | null>(null);

  // Detect online/offline status
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

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

  // Smart time estimation formula:
  // - Base: 30s (model init + classification)
  // - Text PDF: ~8s/page (Gemini 3.1 Pro text extraction)
  // - Scanned PDF: ~15s/page (Gemini 3.1 Pro vision extraction)
  // - Risk flags: 20s
  // - Upload: 5s
  // Detection: scanned if file > 500KB/page estimate
  const isImage = fileName ? /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(fileName) : false;
  const estimatedPages = fileSizeMB
    ? isImage ? 1
      : fileSizeMB < 0.5 ? Math.max(1, Math.round(fileSizeMB * 8))  // text PDF ~60KB/page
      : Math.max(1, Math.round(fileSizeMB * 1.5))  // scanned PDF ~700KB/page
    : 3;
  const isLikelyScanned = fileSizeMB ? fileSizeMB / Math.max(estimatedPages, 1) > 0.3 : false;
  const perPageTime = isImage ? 15 : isLikelyScanned ? 15 : 8;
  const fallbackEstimate = 30 + (estimatedPages * perPageTime) + 20 + 5;

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
          Powered by Gro AI
        </p>

        {/* Offline banner */}
        {isOffline && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs mb-2 w-full max-w-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <span>You&apos;re offline. Processing continues on server — results will appear when you&apos;re back online.</span>
          </div>
        )}

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
  const [selectedDocType, setSelectedDocType] = useState<string>("");
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
  const [customFields, setCustomFields] = useState<{name: string; value: string}[]>([]);
  const [customNotes, setCustomNotes] = useState("");

  const handleSourceClick = (sourcePage?: number, sourceQuote?: string) => {
    // Clear first to force React re-render even if same value
    setPdfHighlightPage(undefined);
    setPdfHighlightQuote(undefined);
    // Set in next tick to ensure state change is detected
    setTimeout(() => {
      setPdfHighlightPage(sourcePage);
      setPdfHighlightQuote(sourceQuote);
    }, 50);
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

  const allSectionsVerified = sectionKeys.length > 0 && sectionKeys.every((k) => {
    // Auto-verify sections with no visible fields (all "Not found")
    if (result?.extraction?.[k] && typeof result.extraction[k] === "object") {
      const hasVisibleFields = Object.values(result.extraction[k] as Record<string, unknown>).some(
        (val) => parseField(val).displayVal !== "Not found"
      );
      if (!hasVisibleFields) return true;
    }
    return verifiedSections.has(k);
  });

  function toggleSectionVerified(key: string) {
    setVerifiedSections((prev) => {
      const next = new Set(prev);
      const wasVerified = next.has(key);
      if (wasVerified) {
        next.delete(key);
      } else {
        next.add(key);
      }
      // Also toggle all field checkboxes in this section
      if (result?.extraction?.[key] && typeof result.extraction[key] === 'object') {
        const sectionFields = Object.keys(result.extraction[key] as Record<string, unknown>);
        setVerifiedFields((prevFields) => {
          const nextFields = new Set(prevFields);
          for (const fieldKey of sectionFields) {
            const path = `${key}.${fieldKey}`;
            if (wasVerified) {
              nextFields.delete(path);
            } else {
              // Only auto-verify fields that have actual values (not "not found")
              const fieldVal = (result?.extraction?.[key] as Record<string, unknown>)?.[fieldKey];
              const isNotFound = fieldVal === null || fieldVal === undefined || fieldVal === "" || fieldVal === "not_found" || fieldVal === "N/A" ||
                (typeof fieldVal === "object" && fieldVal !== null && "value" in (fieldVal as Record<string, unknown>) &&
                  ((fieldVal as Record<string, unknown>).value === null || (fieldVal as Record<string, unknown>).value === "" || (fieldVal as Record<string, unknown>).value === "not_found"));
              if (!isNotFound) {
                nextFields.add(path);
              }
            }
          }
          return nextFields;
        });
      }
      return next;
    });
  }

  // Lease vs License field filter

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

  // Auto-load completed job from URL param (from "View Results" notification)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job_id");
    if (!jobId) return;

    async function loadJob() {
      try {
        const { getExtractionJob } = await import("@/lib/api");
        const job = await getExtractionJob(jobId!);
        if (job.status === "completed" && job.result) {
          setResult(job.result);
          setStep(3);
        }
      } catch {
        // Job not found or failed — ignore
      }
    }
    loadJob();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [bulkNotification, setBulkNotification] = useState<string | null>(null);

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
            // Show notification if user is reviewing another file (Step 3)
            if (data.status === "completed" && step === 3) {
              setBulkNotification(job.filename);
              setTimeout(() => setBulkNotification(null), 8000);
            }
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

    // Add first file as "uploading", rest as "queued"
    const tempIds: Record<string, string> = {};
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const tempId = `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      tempIds[file.name] = tempId;
      setBulkJobs((prev) => [
        ...prev,
        { id: tempId, filename: file.name, status: i === 0 ? "uploading" : "queued" },
      ]);
    }

    // Upload files sequentially — one at a time
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const tempId = tempIds[file.name];

      // Mark current file as uploading
      setBulkJobs((prev) =>
        prev.map((j) => j.id === tempId ? { ...j, status: "uploading" } : j)
      );

      try {
        const data = await uploadAndExtractAsync(file);
        // Mark as processing (server accepted, AI working)
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
    }
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
    if (!selectedDocType) {
      setError("Please select a document type to continue.");
      return;
    }
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
      // Use async upload — server processes in background, we poll for results
      const { uploadAndExtractAsync, getExtractionJob } = await import("@/lib/api");
      const job = await uploadAndExtractAsync(selectedFile);

      if (!job.job_id) {
        // Fallback: if async endpoint returned a direct result (e.g. duplicate)
        if (job.status === "duplicate") {
          if (selectedDocType) job.document_type = selectedDocType;
          setResult(job);
          setStep(3);
          setDuplicateWarning(job.message || "This document has already been uploaded.");
          return;
        }
        throw new Error("Failed to start processing job");
      }

      // Poll for completion every 3 seconds
      const pollInterval = setInterval(async () => {
        try {
          const status = await getExtractionJob(job.job_id);

          if (status.status === "completed" && status.result) {
            clearInterval(pollInterval);
            const data = status.result;
            if (selectedDocType) {
              data.document_type = selectedDocType;
            }
            if (data.status === "duplicate") {
              setResult(data);
              setStep(3);
              setDuplicateWarning(data.message || "This document has already been uploaded.");
            } else if (data.error && data.status === "partial" && Object.keys(data.extraction || {}).length === 0) {
              setError(data.error);
              setStep(1);
            } else {
              setResult(data);
              setStep(3);
              if (data.error) {
                setError(data.error);
              }
            }
          } else if (status.status === "failed") {
            clearInterval(pollInterval);
            setError(status.error || "Extraction failed. Please try again.");
            setStep(1);
          }
          // else: still processing — keep polling
        } catch {
          // Network error during poll — don't stop, keep trying
          // Processing continues on server regardless
        }
      }, 3000);

      // Store interval ID so we can clean up if component unmounts
      return () => clearInterval(pollInterval);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start extraction. Please try again.");
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
          { num: 2, label: "Gro AI Processing" },
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
              onClick={() => { setIsDraftMode(true); setSelectedDocType("lease_loi"); }}
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
          {/* Document Type Selector */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Select Document Type <span className="text-rose-500">*</span></p>
            <div className="flex flex-wrap items-center gap-2">
              {(isDraftMode
                ? [{ value: "lease_loi", label: "Lease / LOI" }]
                : [
                    { value: "lease_loi", label: "Lease / LOI" },
                    { value: "license_certificate", label: "License / Certificate" },
                    { value: "franchise_agreement", label: "Franchise Agreement" },
                    { value: "supplementary_agreement", label: "Addendum / Amendment" },
                    { value: "bill", label: "Bill / Invoice" },
                  ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setSelectedDocType(opt.value); if (error === "Please select a document type to continue.") setError(null); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    selectedDocType === opt.value
                      ? "bg-foreground text-white border-foreground"
                      : "bg-white text-[#4a5568] border-slate-200 hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
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
                  if (!files || files.length === 0) return;
                  if (!selectedDocType) {
                    setError("Please select a document type to continue.");
                    e.target.value = "";
                    return;
                  }
                  handleBulkUpload(files);
                  e.target.value = "";
                }}
              />
              {/* Uploading animation overlay for bulk */}
              {bulkJobs.some(j => j.status === "uploading") && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50">
                  <CloudUpload className="h-5 w-5 animate-pulse text-blue-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-700">Uploading documents...</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {bulkJobs.filter(j => j.status === "uploading").length} uploading, {bulkJobs.filter(j => j.status === "queued").length} queued
                    </p>
                  </div>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                </div>
              )}
              <div
                className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all border-neutral-300 hover:border-neutral-400 hover:bg-muted/50"
                onClick={() => {
                  if (!selectedDocType) {
                    setError("Please select a document type to continue.");
                    return;
                  }
                  document.getElementById("bulk-file-input")?.click();
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!selectedDocType) {
                    setError("Please select a document type to continue.");
                    return;
                  }
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
                      {job.status === "queued" && (
                        <Clock className="h-5 w-5 text-slate-400 flex-shrink-0" />
                      )}
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
                        {job.status === "queued" && (
                          <p className="text-xs text-slate-400 font-medium">Queued — waiting...</p>
                        )}
                        {(job.status === "uploading" || job.status === "processing") && (
                          <>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-amber-600">
                                {job.status === "uploading" ? "Uploading & starting extraction..." : "Gro AI is analyzing..."}
                              </p>
                              <span className="text-[10px] text-muted-foreground">~2-3 min</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              {["Upload", "Scan", "Extract", "Risk Check"].map((step, i) => {
                                const activeStep = job.status === "uploading" ? 0 : 2;
                                return (
                                  <div key={step} className="flex items-center gap-1">
                                    <div className={`h-1.5 flex-1 rounded-full min-w-[40px] ${
                                      i < activeStep ? "bg-emerald-400" : i === activeStep ? "bg-amber-400 animate-pulse" : "bg-slate-200"
                                    }`} />
                                    <span className={`text-[9px] ${i <= activeStep ? "text-foreground font-medium" : "text-muted-foreground"}`}>{step}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {job.status === "completed" && (
                          <p className="text-xs text-emerald-600 font-medium">
                            ✓ Ready to review
                            {job.result && ` — ${job.result.document_type?.replace(/_/g, " ")}`}
                            {job.result?.risk_flags && ` · ${job.result.risk_flags.length} risk flag${job.result.risk_flags.length !== 1 ? "s" : ""}`}
                          </p>
                        )}
                        {job.status === "failed" && (
                          <p className="text-xs text-rose-500 font-medium">
                            ✗ {job.error || "Extraction failed"}
                          </p>
                        )}
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
              Start Gro AI Extraction
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
          {/* Notification: another file finished processing */}
          {bulkNotification && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-blue-200 bg-blue-50 animate-in slide-in-from-top">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-800">
                  <strong>{bulkNotification}</strong> finished processing
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="text-xs h-7 border-blue-300 text-blue-700" onClick={() => {
                  setBulkNotification(null);
                  setStep(1);
                  setResult(null);
                  setBulkMode(true);
                }}>
                  View Queue
                </Button>
                <button onClick={() => setBulkNotification(null)} className="text-blue-400 hover:text-blue-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
          {/* Summary bar */}
          <div className="flex items-center gap-4 p-4 rounded-xl border bg-emerald-50 border-emerald-200">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-700">Extraction Complete</p>
              <p className="text-xs text-emerald-600 flex items-center gap-2 flex-wrap">
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] font-semibold">
                  {(result.document_type || "unknown").replace(/_/g, " ").toUpperCase()}
                </Badge>
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
            <div className="flex items-center gap-1 justify-center flex-wrap">
              {/* Risk flags dot (if any) */}
              {result.risk_flags.length > 0 && (
                <button
                  onClick={() => { setActiveSectionIndex(0); setPdfHighlightPage(undefined); setPdfHighlightQuote(undefined); }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                    activeSectionIndex === 0 ? "bg-rose-600 text-white shadow-sm" : "bg-rose-100 text-rose-700 hover:bg-rose-200"
                  }`}
                  title="Risk Flags"
                >
                  <Shield className="h-2.5 w-2.5" />
                  <span className="hidden sm:inline">Risks</span>
                  <span className="sm:hidden">!</span>
                </button>
              )}
              {/* Data section dots */}
              {sectionKeys.map((key, idx) => {
                const dataSectionOffset = result.risk_flags.length > 0 ? 1 : 0;
                const stepIdx = idx + dataSectionOffset;
                const isActive = stepIdx === activeSectionIndex;
                const sectionData = result.extraction[key];
                const hasVisibleFields = sectionData && typeof sectionData === "object"
                  ? Object.values(sectionData as Record<string, unknown>).some(v => parseField(v).displayVal !== "Not found")
                  : false;
                const isVerified = verifiedSections.has(key) || !hasVisibleFields;
                const conf = sectionConfig[key] || { title: formatFieldLabel(key), icon: FileText };
                return (
                  <button
                    key={key}
                    onClick={() => { setActiveSectionIndex(stepIdx); setPdfHighlightPage(undefined); setPdfHighlightQuote(undefined); }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                      isActive ? "bg-foreground text-white shadow-sm" : isVerified ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    title={conf.title}
                  >
                    {isVerified && !isActive && <Check className="h-2.5 w-2.5" />}
                    <span className="hidden sm:inline">{conf.title.split(" ")[0]}</span>
                    <span className="sm:hidden">{idx + 1}</span>
                  </button>
                );
              })}
              {/* Custom fields dot */}
              <button
                onClick={() => { setActiveSectionIndex((result.risk_flags.length > 0 ? 1 : 0) + sectionKeys.length); setPdfHighlightPage(undefined); setPdfHighlightQuote(undefined); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                  activeSectionIndex === (result.risk_flags.length > 0 ? 1 : 0) + sectionKeys.length
                    ? "bg-foreground text-white shadow-sm"
                    : customFields.length > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                title="Custom Clauses"
              >
                <Plus className="h-2.5 w-2.5" />
                <span className="hidden sm:inline">Custom</span>
              </button>
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
                  <div className="flex items-center gap-2">
                    {pdfHighlightQuote && (
                      <button
                        onClick={() => { setPdfHighlightPage(undefined); setPdfHighlightQuote(undefined); }}
                        className="text-[10px] text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100"
                      >
                        Clear highlight
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ height: "calc(100vh - 320px)", minHeight: "400px" }} className="relative">
                  {fileUrl && (selectedFile?.type === "application/pdf" || (!selectedFile && result?.filename?.toLowerCase().endsWith(".pdf"))) ? (
                    <PdfViewer
                      url={fileUrl}
                      activePage={pdfHighlightPage}
                      highlightQuote={pdfHighlightQuote}
                      ocrPages={result?.ocr_pages}
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
              {/* Section title */}
              <h2 className="text-sm font-semibold text-foreground">Extracted Data — Review Section by Section</h2>

              {/* One-Section-at-a-Time Stepper */}
              {(() => {
                // Show risk flags as a special first "section" if any exist
                const hasRiskFlags = result.risk_flags.length > 0;
                const showRiskFlags = hasRiskFlags && activeSectionIndex === 0;
                // After risk flags (or if none), show data sections one at a time
                const dataSectionOffset = hasRiskFlags ? 1 : 0;
                const currentDataIdx = activeSectionIndex - dataSectionOffset;
                const isOnDataSection = activeSectionIndex >= dataSectionOffset && currentDataIdx < sectionKeys.length;
                const isOnCustomSection = activeSectionIndex === dataSectionOffset + sectionKeys.length;
                const totalSteps = dataSectionOffset + sectionKeys.length + 1; // +1 for custom fields

                const currentSectionKey = isOnDataSection ? sectionKeys[currentDataIdx] : null;

                return (
                  <>
                    {/* Risk Flags Section */}
                    {showRiskFlags && (
                      <Card className="overflow-hidden border-rose-200">
                        <div className="flex items-center gap-2 px-4 py-3 bg-rose-50/50">
                          <Shield className="h-4 w-4 text-rose-600 flex-shrink-0" />
                          <span className="text-sm font-semibold flex-1">Risk Flags</span>
                          <Badge variant="outline" className="text-[10px] border-rose-200 text-rose-700">
                            {result.risk_flags.length}
                          </Badge>
                        </div>
                        <CardContent className="pt-3 pb-3 space-y-2">
                          {result.risk_flags.map((flag, i) => (
                            <div
                              key={i}
                              className={`p-2.5 rounded-lg border transition-colors ${flag.clause_text ? "cursor-pointer" : ""} ${
                                flag.severity === "high"
                                  ? "border-rose-200 bg-rose-50/50" + (flag.clause_text ? " hover:bg-rose-100/50" : "")
                                  : "border-amber-200 bg-amber-50/50" + (flag.clause_text ? " hover:bg-amber-100/50" : "")
                              }`}
                              onClick={() => {
                                if (flag.clause_text || (flag as Record<string, unknown>).source_page) {
                                  handleSourceClick(
                                    (flag as Record<string, unknown>).source_page as number | undefined,
                                    flag.clause_text
                                  );
                                }
                              }}
                              title={flag.clause_text ? "Click to find in document" : "Auto-detected risk — no specific clause"}
                            >
                              <div className="flex items-start gap-2">
                                <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${flag.severity === "high" ? "text-rose-600" : "text-amber-600"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                    <span className="text-xs font-medium">{flag.name || flag.explanation}</span>
                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${flag.severity === "high" ? "border-rose-200 text-rose-700" : "border-amber-200 text-amber-700"}`}>
                                      {flag.severity}
                                    </Badge>
                                    {typeof (flag as Record<string, unknown>).source_page === "number" && (
                                      <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
                                        Pg {Number((flag as Record<string, unknown>).source_page)}
                                      </span>
                                    )}
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
                      </Card>
                    )}

                    {/* Current Data Section */}
                    {isOnDataSection && currentSectionKey && (() => {
                      const sectionKey = currentSectionKey;
                      const sectionData = result.extraction[sectionKey];
                      if (typeof sectionData !== "object" || sectionData === null) return null;
                      const allFields = Object.entries(sectionData as Record<string, unknown>);
                      const fields = allFields.filter(([, val]) => {
                        const { displayVal } = parseField(val);
                        return displayVal !== "Not found";
                      });
                      if (fields.length === 0) return null;

                      const config = sectionConfig[sectionKey] || { title: formatFieldLabel(sectionKey), icon: FileText };
                      const Icon = config.icon;
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
                        <Card key={sectionKey} id={`section-${sectionKey}`} className="overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
                            <Icon className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
                            <span className="text-sm font-semibold flex-1">{config.title}</span>
                            <div className="flex items-center gap-1.5 mr-1">
                              {sectionStats.high > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{sectionStats.high}
                                </span>
                              )}
                              {sectionStats.medium > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{sectionStats.medium}
                                </span>
                              )}
                              {sectionStats.low > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-700">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />{sectionStats.low}
                                </span>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {fields.length}/{allFields.length} fields
                            </Badge>
                            {verifiedSections.has(sectionKey) && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                                <Check className="h-2.5 w-2.5" /> Verified
                              </span>
                            )}
                          </div>
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

                                const { sourcePage, sourceQuote } = parseField(fieldVal);

                                return (
                                  <div key={fieldKey} className={`min-w-0 group/field rounded-lg p-2.5 -mx-1 transition-colors ${isNotFound ? "opacity-50" : "hover:bg-muted"}`}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <ConfidenceDot level={confidence} />
                                      <p
                                        className={`text-[10px] uppercase tracking-wider font-semibold flex-1 text-[#9ca3af] ${!isNotFound ? "cursor-pointer hover:text-blue-600" : ""}`}
                                        onClick={() => {
                                          if (isNotFound) return;
                                          if (sourcePage || sourceQuote) {
                                            handleSourceClick(sourcePage, sourceQuote);
                                          } else {
                                            handleSourceClick(undefined, displayVal.slice(0, 60));
                                          }
                                        }}
                                      >
                                        {formatFieldLabel(fieldKey)}
                                      </p>
                                      {sourcePage && (
                                        <button
                                          type="button"
                                          onClick={() => handleSourceClick(sourcePage, sourceQuote)}
                                          className="text-[10px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100"
                                          title={sourceQuote ? `Source: "${sourceQuote.slice(0, 60)}..."` : `Found on page ${sourcePage}`}
                                        >
                                          <FileText className="h-2.5 w-2.5" />
                                          Pg {sourcePage}
                                        </button>
                                      )}
                                      <span>{getConfidenceBadge(confidence)}</span>
                                    </div>
                                    {isNotFound ? (
                                      <EditableField value="" displayValue="Not found in document" isNotFound={true} onChange={(newVal) => {
                                        setResult((prev) => {
                                          if (!prev) return prev;
                                          const updated = { ...prev, extraction: { ...prev.extraction } };
                                          const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                          const existing = section[fieldKey];
                                          if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                            section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal };
                                          } else { section[fieldKey] = newVal; }
                                          updated.extraction[sectionKey] = section;
                                          return updated;
                                        });
                                      }} />
                                    ) : isBool ? (
                                      <div className="pl-4">
                                        <button type="button" onClick={() => {
                                          const newVal = displayVal === "Yes" ? "No" : "Yes";
                                          setResult((prev) => {
                                            if (!prev) return prev;
                                            const updated = { ...prev, extraction: { ...prev.extraction } };
                                            const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                            const existing = section[fieldKey];
                                            if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                              section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal === "Yes" };
                                            } else { section[fieldKey] = newVal === "Yes"; }
                                            updated.extraction[sectionKey] = section;
                                            return updated;
                                          });
                                        }} className="cursor-pointer hover:opacity-80 transition-opacity" title="Click to toggle">
                                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${displayVal === "Yes" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                                            {displayVal === "Yes" ? "✓" : "✗"} {displayVal}
                                          </span>
                                        </button>
                                      </div>
                                    ) : isMultiLine && Array.isArray((() => {
                                      const sec = result.extraction[sectionKey] as Record<string, unknown>;
                                      const raw = sec[fieldKey];
                                      if (typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>)) return (raw as Record<string, unknown>).value;
                                      return raw;
                                    })()) ? (
                                      <div className="pl-4 mt-1">
                                        {(() => {
                                          const sec = result.extraction[sectionKey] as Record<string, unknown>;
                                          const raw = sec[fieldKey];
                                          const arrVal = (typeof raw === "object" && raw !== null && "value" in (raw as Record<string, unknown>))
                                            ? (raw as Record<string, unknown>).value as unknown[] : raw as unknown[];
                                          if (fieldKey === "rent_schedule" && arrVal.length > 0 && typeof arrVal[0] === "object") {
                                            const items = arrVal as Record<string, unknown>[];
                                            const allKeys = Array.from(new Set(items.flatMap(o => Object.keys(o)))).filter(k => k !== "confidence" && k !== "source_page" && k !== "source_quote");
                                            return (
                                              <div className="overflow-x-auto rounded-lg border">
                                                <table className="w-full text-xs">
                                                  <thead><tr className="bg-muted">{allKeys.map(k => (<th key={k} className="px-2 py-1.5 text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">{k.replace(/_/g, " ")}</th>))}</tr></thead>
                                                  <tbody>{items.map((row, ri) => (<tr key={ri} className="border-t hover:bg-muted/50">{allKeys.map(k => (<td key={k} className="px-2 py-1.5 text-sm">{row[k] != null ? String(row[k]) : "--"}</td>))}</tr>))}</tbody>
                                                </table>
                                              </div>
                                            );
                                          }
                                          return arrVal.map((item, idx) => {
                                            const { displayVal: itemDisplay } = parseField(item);
                                            return (
                                              <div key={idx} className="flex items-start gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-foreground mt-1.5 flex-shrink-0" />
                                                <EditableField value={itemDisplay} isNotFound={false} onChange={(newVal) => {
                                                  setResult((prev) => {
                                                    if (!prev) return prev;
                                                    const updated = { ...prev, extraction: { ...prev.extraction } };
                                                    const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                                    const existing = section[fieldKey];
                                                    let arr: unknown[];
                                                    if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                                      arr = [...((existing as Record<string, unknown>).value as unknown[])]; arr[idx] = newVal;
                                                      section[fieldKey] = { ...(existing as Record<string, unknown>), value: arr };
                                                    } else { arr = [...(existing as unknown[])]; arr[idx] = newVal; section[fieldKey] = arr; }
                                                    updated.extraction[sectionKey] = section;
                                                    return updated;
                                                  });
                                                }} />
                                              </div>
                                            );
                                          });
                                        })()}
                                      </div>
                                    ) : isMultiLine ? (
                                      <EditableField value={displayVal} isNotFound={false} multiline onChange={(newVal) => {
                                        setResult((prev) => {
                                          if (!prev) return prev;
                                          const updated = { ...prev, extraction: { ...prev.extraction } };
                                          const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                          const existing = section[fieldKey];
                                          if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                            section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal };
                                          } else { section[fieldKey] = newVal; }
                                          updated.extraction[sectionKey] = section;
                                          return updated;
                                        });
                                      }} />
                                    ) : (
                                      <EditableField value={displayVal} displayValue={formattedVal !== displayVal ? formattedVal : undefined} isNotFound={false} onChange={(newVal) => {
                                        setResult((prev) => {
                                          if (!prev) return prev;
                                          const updated = { ...prev, extraction: { ...prev.extraction } };
                                          const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                          const existing = section[fieldKey];
                                          if (typeof existing === "object" && existing !== null && "value" in (existing as Record<string, unknown>)) {
                                            section[fieldKey] = { ...(existing as Record<string, unknown>), value: newVal };
                                          } else { section[fieldKey] = newVal; }
                                          updated.extraction[sectionKey] = section;
                                          return updated;
                                        });
                                      }} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Section verification checkbox */}
                            <div className="mt-4 pt-3 border-t">
                              <button
                                type="button"
                                onClick={() => toggleSectionVerified(sectionKey)}
                                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors text-sm font-medium ${
                                  verifiedSections.has(sectionKey)
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                                    : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <span className={`h-5 w-5 rounded border flex items-center justify-center ${
                                  verifiedSections.has(sectionKey) ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                                }`}>
                                  {verifiedSections.has(sectionKey) && <Check className="h-3 w-3" />}
                                </span>
                                {verifiedSections.has(sectionKey) ? "Section verified" : "I have reviewed and verified this section"}
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}

                    {/* Custom Details Section (last step) */}
                    {isOnCustomSection && (
                      <Card className="overflow-hidden border-dashed">
                        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
                          <Plus className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold flex-1">Add Custom Clauses & Details</span>
                          <span className="text-xs text-muted-foreground">Add any manual clauses or notes</span>
                        </div>
                        <CardContent className="pt-3 pb-3">
                          <div className="space-y-3">
                            {(customFields || []).map((cf, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <Input
                                  placeholder="Clause / Field name"
                                  className="h-8 text-sm w-[180px]"
                                  value={cf.name}
                                  onChange={(e) => setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))}
                                />
                                <Input
                                  placeholder="Value / Details"
                                  className="h-8 text-sm flex-1"
                                  value={cf.value}
                                  onChange={(e) => setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, value: e.target.value } : f))}
                                />
                                <button onClick={() => setCustomFields(prev => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-rose-500 p-1">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setCustomFields(prev => [...prev, { name: "", value: "" }])}>
                              <Plus className="h-3 w-3" /> Add Clause / Field
                            </Button>
                            {/* Custom Notes */}
                            <div className="pt-3 border-t mt-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1.5">Notes</p>
                              <textarea
                                placeholder="Add any notes, observations, or comments about this agreement..."
                                className="w-full min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20"
                                value={customNotes}
                                onChange={(e) => setCustomNotes(e.target.value)}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Prev / Next Navigation */}
                    <div className="flex items-center justify-between pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={activeSectionIndex === 0}
                        onClick={() => {
                          setActiveSectionIndex((i) => Math.max(0, i - 1));
                          setPdfHighlightPage(undefined);
                          setPdfHighlightQuote(undefined);
                        }}
                        className="gap-1"
                      >
                        <ChevronLeft className="h-4 w-4" /> Previous
                      </Button>
                      <span className="text-xs text-muted-foreground font-medium tabular-nums">
                        Step {activeSectionIndex + 1} of {totalSteps}
                      </span>
                      {activeSectionIndex < totalSteps - 1 ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveSectionIndex((i) => Math.min(totalSteps - 1, i + 1));
                            setPdfHighlightPage(undefined);
                            setPdfHighlightQuote(undefined);
                          }}
                          className="gap-1"
                        >
                          Next <ChevronRight className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div />
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
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
                      <p className="text-sm font-semibold">Confirm & Activate Agreement</p>
                      <p className="text-xs text-muted-foreground">Please confirm all entries are correct</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      You have manually verified all <strong className="text-foreground">{verifiedSections.size}</strong> of <strong className="text-foreground">{sectionKeys.length}</strong> sections.
                    </p>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-800">
                        Once activated, this will create an outlet and agreement in your portfolio with events and payment reminders. This action cannot be undone.
                      </p>
                    </div>
                  </div>
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
                        file_hash: result.file_hash,
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
                        file_hash: result.file_hash,
                        custom_notes: customNotes || undefined,
                        custom_clauses: customFields.filter(f => f.name && f.value).length > 0
                          ? customFields.filter(f => f.name && f.value)
                          : undefined,
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
