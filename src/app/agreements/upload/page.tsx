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
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { uploadAndExtract, confirmAndActivate, getProcessingEstimate, uploadAndExtractAsync, getExtractionJob } from "@/lib/api";
import { EditableField } from "@/components/editable-field";
import { FeedbackButton } from "@/components/feedback-button";
import { PageHeader } from "@/components/page-header";

type Confidence = "high" | "medium" | "low" | "not_found";

function ConfidenceDot({ level }: { level: Confidence }) {
  const colors: Record<Confidence, string> = {
    high: "bg-emerald-500",
    medium: "bg-amber-500",
    low: "bg-red-500",
    not_found: "bg-neutral-300",
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
    .replace("Mglr", "MGLR")
    .replace("Tds", "TDS");
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
function parseField(fieldVal: unknown): { displayVal: string; confidence: Confidence } {
  if (fieldVal === null || fieldVal === undefined || fieldVal === "" || fieldVal === "not_found" || fieldVal === "N/A") {
    return { displayVal: "Not found", confidence: "not_found" };
  }

  // Handle { value, confidence } objects from Gemini
  if (typeof fieldVal === "object" && !Array.isArray(fieldVal)) {
    const obj = fieldVal as Record<string, unknown>;
    if ("value" in obj) {
      const conf = (typeof obj.confidence === "string" ? obj.confidence : "high") as Confidence;
      const val = obj.value;
      if (val === null || val === undefined || val === "" || val === "not_found" || val === "N/A") {
        return { displayVal: "Not found", confidence: "not_found" };
      }
      if (typeof val === "object") {
        // Recursively parse arrays/objects (e.g. rent_schedule wrapped in {value, confidence})
        return { displayVal: parseField(val).displayVal, confidence: conf };
      }
      return { displayVal: String(val), confidence: conf };
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
  { label: "Running GroBot analysis", duration: 5000 },
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
          <div className="h-16 w-16 rounded-full bg-[#f4f6f9] flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-black animate-spin" />
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-1">
          {currentStageLabel}
        </h2>
        <p className="text-sm text-muted-foreground mb-1">
          Powered by GroBot
        </p>

        {/* Processing time estimate & live timer (Task 43) */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-[#6b7280] bg-[#f4f6f9] px-3 py-1.5 rounded-full">
            Estimated: {estimatedRangeLow}-{estimatedRangeHigh} seconds
          </span>
          <span className="text-xs font-semibold tabular-nums bg-[#132337] text-white px-3 py-1.5 rounded-full">
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
            <span className="text-xs font-medium text-[#132337]">{currentStageLabel}</span>
            <span className="text-xs font-semibold tabular-nums">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-2 bg-[#f4f6f9] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#132337] rounded-full transition-all duration-700 ease-out"
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
                  ? "text-black"
                  : i === activeStep
                  ? "text-black"
                  : "text-muted-foreground opacity-40"
              }`}
            >
              {i < activeStep ? (
                <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              ) : i === activeStep ? (
                <Loader2 className="h-4 w-4 text-black animate-spin flex-shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-neutral-300 flex-shrink-0" />
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
  const [step, setStep] = useState(1);
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
  const [pdfZoom, setPdfZoom] = useState(100);

  // Create object URL for PDF viewer
  const fileUrl = useMemo(() => {
    if (selectedFile) return URL.createObjectURL(selectedFile);
    return null;
  }, [selectedFile]);

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
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
            <AlertTriangle className="h-3 w-3" />
            Low
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6b7280] bg-[#f4f6f9] border border-[#e4e8ef] rounded-full px-1.5 py-0.5">
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

  // Poll bulk jobs
  useEffect(() => {
    const processing = bulkJobs.filter((j) => j.status === "processing");
    if (processing.length === 0) return;

    const interval = setInterval(async () => {
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
          // keep polling
        }
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [bulkJobs]);

  async function handleBulkUpload(files: FileList) {
    const newFiles = Array.from(files).slice(0, MAX_BULK_FILES - bulkJobs.length);
    for (const file of newFiles) {
      if (!isValidFile(file)) continue;
      try {
        const data = await uploadAndExtractAsync(file);
        setBulkJobs((prev) => [
          ...prev,
          {
            id: data.job_id,
            filename: data.filename || file.name,
            status: "processing",
          },
        ]);
      } catch {
        // skip invalid files
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
          { num: 2, label: "GroBot Processing" },
          { num: 3, label: "Review & Confirm" },
          { num: 4, label: "Activated" },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold transition-colors ${
                  step > s.num
                    ? "bg-emerald-600 text-white"
                    : step === s.num
                    ? "bg-[#132337] text-white"
                    : "bg-[#e4e8ef] text-[#6b7280]"
                }`}
              >
                {step > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span
                className={`text-sm font-medium ${
                  step >= s.num ? "text-black" : "text-[#9ca3af]"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < 3 && (
              <div
                className={`mx-4 h-px w-16 ${
                  step > s.num ? "bg-emerald-600" : "bg-[#e4e8ef]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 text-red-800">
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

      {/* Bulk Upload Toggle */}
      {step === 1 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setBulkMode(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!bulkMode ? "bg-[#132337] text-white" : "bg-[#f4f6f9] text-[#4a5568] hover:bg-[#e4e8ef]"}`}
          >
            Single Upload
          </button>
          <button
            onClick={() => setBulkMode(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${bulkMode ? "bg-[#132337] text-white" : "bg-[#f4f6f9] text-[#4a5568] hover:bg-[#e4e8ef]"}`}
          >
            Bulk Upload (up to {MAX_BULK_FILES})
          </button>
        </div>
      )}

      {/* Bulk Upload Mode */}
      {step === 1 && bulkMode && (
        <div className="max-w-2xl mx-auto space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-4">Bulk Document Upload</h2>
              <p className="text-sm text-[#6b7280] mb-4">
                Upload up to {MAX_BULK_FILES} documents at once. Each will be processed independently in the background.
              </p>
              <div
                className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all border-neutral-300 hover:border-neutral-400 hover:bg-[#f4f6f9]/50"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.multiple = true;
                  input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.tif";
                  input.onchange = (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (files) handleBulkUpload(files);
                  };
                  input.click();
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
              <h3 className="text-sm font-semibold text-[#132337]">Processing Queue</h3>
              {bulkJobs.map((job) => (
                <Card key={job.id} className={`overflow-hidden ${job.status === "completed" ? "border-emerald-200" : job.status === "failed" ? "border-red-200" : "border-[#e4e8ef]"}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {job.status === "processing" && (
                        <Loader2 className="h-5 w-5 animate-spin text-[#132337] flex-shrink-0" />
                      )}
                      {job.status === "completed" && (
                        <Check className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                      )}
                      {job.status === "failed" && (
                        <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.filename}</p>
                        <p className="text-xs text-[#9ca3af]">
                          {job.status === "processing" && "Processing..."}
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
                          onClick={async () => {
                            try {
                              const res = await confirmAndActivate({
                                extraction: job.result!.extraction,
                                document_type: job.result!.document_type,
                                risk_flags: job.result!.risk_flags,
                                confidence: job.result!.confidence,
                                filename: job.result!.filename || job.filename,
                                document_text: job.result!.document_text,
                                document_url: job.result!.document_url,
                              });
                              setBulkJobs((prev) =>
                                prev.map((j) =>
                                  j.id === job.id
                                    ? { ...j, status: "activated" as string }
                                    : j
                                )
                              );
                              router.push(`/agreements/${res.agreement_id}`);
                            } catch {
                              // handle error
                            }
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
      {step === 1 && !bulkMode && (
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
                      ? "border-black bg-[#f4f6f9] scale-[1.01]"
                      : "border-neutral-300 hover:border-neutral-400 hover:bg-[#f4f6f9]/50"
                  }`}
                >
                  <div className="h-14 w-14 rounded-full bg-[#f4f6f9] flex items-center justify-center mb-4">
                    <CloudUpload className="h-7 w-7 text-[#9ca3af]" />
                  </div>
                  <p className="text-sm font-medium text-black mb-1">
                    Drag and drop your document here
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    or click to browse files
                  </p>
                  <Badge variant="outline" className="text-xs font-normal">PDF or image up to 50MB</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl border bg-[#f4f6f9]">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${selectedFile?.type?.startsWith("image/") ? "bg-[#f4f6f9]" : "bg-red-100"}`}>
                    <FileText className={`h-5 w-5 ${selectedFile?.type?.startsWith("image/") ? "text-[#132337]" : "text-red-600"}`} />
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
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleStartExtraction}
              disabled={!selectedFile}
              className="gap-2 px-6"
            >
              Start GroBot Extraction
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
          <div className="flex items-center gap-4 p-4 rounded-xl border bg-emerald-50/80 border-emerald-200">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-900">Extraction Complete</p>
              <p className="text-xs text-emerald-700">
                Classified as <strong>{(result.document_type || "unknown").replace(/_/g, " ").toUpperCase()}</strong>
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

          {/* Stats bar */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg border bg-[#fafbfd]">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-[11px] text-muted-foreground">Fields Extracted</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-[#fafbfd]">
                <p className="text-2xl font-bold text-emerald-600">{stats.highConf}</p>
                <p className="text-[11px] text-muted-foreground">High Confidence</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-[#fafbfd]">
                <p className="text-2xl font-bold text-amber-600">{stats.medConf + stats.lowConf}</p>
                <p className="text-[11px] text-muted-foreground">Needs Review</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-[#fafbfd]">
                <p className="text-2xl font-bold text-red-600">{result.risk_flags.length}</p>
                <p className="text-[11px] text-muted-foreground">Risk Flags</p>
              </div>
            </div>
          )}

          {/* Split-Screen: PDF Viewer (left) + Extracted Fields (right) */}
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">
            {/* LEFT SIDE: PDF Viewer */}
            <div className="w-full lg:w-1/2 lg:sticky lg:top-4 lg:self-start">
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#f4f6f9] border-b">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[#6b7280]" />
                    <span className="text-xs font-medium text-[#132337] truncate max-w-[200px]">
                      {result.filename}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setPdfZoom((z) => Math.max(50, z - 25))}
                      disabled={pdfZoom <= 50}
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs font-medium text-[#6b7280] w-10 text-center tabular-nums">
                      {pdfZoom}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setPdfZoom((z) => Math.min(200, z + 25))}
                      disabled={pdfZoom >= 200}
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="bg-[#f4f6f9] overflow-auto" style={{ height: "calc(100vh - 320px)", minHeight: "400px" }}>
                  {fileUrl && selectedFile?.type === "application/pdf" ? (
                    <iframe
                      src={`${fileUrl}#toolbar=0&view=FitH`}
                      className="border-0"
                      title="Document Preview"
                      style={{
                        width: `${pdfZoom}%`,
                        height: "100%",
                        minHeight: "100%",
                        transformOrigin: "top left",
                      }}
                    />
                  ) : fileUrl && selectedFile?.type?.startsWith("image/") ? (
                    <div className="flex items-center justify-center p-4 h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={fileUrl}
                        alt="Uploaded document"
                        className="max-w-full object-contain"
                        style={{
                          transform: `scale(${pdfZoom / 100})`,
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
                <h2 className="text-sm font-semibold text-[#132337]">Extracted Data</h2>
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
                <Card className="overflow-hidden border-red-200">
                  <button
                    className="w-full flex items-center gap-2 px-4 py-3 bg-red-50/50 hover:bg-red-50 transition-colors text-left"
                    onClick={() => toggleSection("_risk_flags")}
                  >
                    <Shield className="h-4 w-4 text-red-500 flex-shrink-0" />
                    <span className="text-sm font-semibold flex-1">Risk Flags</span>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-red-300 text-red-700 mr-1"
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

              {/* Extracted Data — Accordion Sections */}
              {Object.entries(result.extraction).map(([sectionKey, sectionData]) => {
                if (typeof sectionData !== "object" || sectionData === null) return null;
                const fields = Object.entries(sectionData as Record<string, unknown>);
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
                      className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[#f4f6f9]/80 transition-colors text-left"
                      onClick={() => toggleSection(sectionKey)}
                    >
                      <Icon className="h-4 w-4 text-[#6b7280] flex-shrink-0" />
                      <span className="text-sm font-semibold flex-1">{config.title}</span>
                      <div className="flex items-center gap-1.5 mr-1">
                        {sectionStats.high > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {sectionStats.high}
                          </span>
                        )}
                        {sectionStats.medium > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {sectionStats.medium}
                          </span>
                        )}
                        {sectionStats.low > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
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

                            return (
                              <div key={fieldKey} className={`min-w-0 group/field rounded-lg p-2.5 -mx-1 transition-colors ${isNotFound ? "opacity-50" : "hover:bg-[#f4f6f9]"}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <ConfidenceDot level={confidence} />
                                  <p className="text-[10px] text-[#9ca3af] uppercase tracking-wider font-semibold flex-1">
                                    {formatFieldLabel(fieldKey)}
                                  </p>
                                  <span className="opacity-0 group-hover/field:opacity-100 transition-opacity">
                                    {getConfidenceBadge(confidence)}
                                  </span>
                                  <FeedbackButton
                                    agreementId={result.filename}
                                    fieldName={`${sectionKey}.${fieldKey}`}
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
                                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${displayVal === "Yes" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
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
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#132337] mt-1.5 flex-shrink-0" />
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

          {/* Action Bar */}
          <Separator />
          <div className="flex items-center justify-between py-2">
            <Button
              variant="ghost"
              onClick={() => {
                setStep(1);
                setResult(null);
                setSelectedFile(null);
                setError(null);
              }}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Upload Another
            </Button>
            <div className="flex items-center gap-3">
              <Button
                disabled={isConfirming}
                onClick={async () => {
                  if (!result) return;
                  setIsConfirming(true);
                  setError(null);
                  try {
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
                    setStep(4);
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Activation failed. Please try again."
                    );
                  } finally {
                    setIsConfirming(false);
                  }
                }}
                className="gap-2 px-6"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Activating...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Confirm &amp; Activate
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Activated */}
      {step === 4 && activationResult && (
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center">
            <div className="mb-6">
              <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="h-10 w-10 text-emerald-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-2">Agreement Activated!</h2>
            <p className="text-sm text-muted-foreground mb-8">
              {activationResult.obligations_count} obligations and{" "}
              {activationResult.alerts_count} alerts have been auto-generated
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-sm">
              <Button
                className="w-full gap-2"
                onClick={() =>
                  router.push(`/agreements/${activationResult.agreement_id}`)
                }
              >
                View Agreement
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() =>
                  router.push(`/outlets/${activationResult.outlet_id}`)
                }
              >
                View Outlet
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              className="mt-4 gap-1"
              onClick={() => {
                setStep(1);
                setResult(null);
                setSelectedFile(null);
                setActivationResult(null);
                setError(null);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Upload Another
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
