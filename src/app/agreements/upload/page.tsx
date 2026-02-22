"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { uploadAndExtract, confirmAndActivate } from "@/lib/api";
import { EditableField } from "@/components/editable-field";

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
        return { displayVal: JSON.stringify(val), confidence: conf };
      }
      return { displayVal: String(val), confidence: conf };
    }
    // Generic object without value key
    return { displayVal: JSON.stringify(obj), confidence: "high" };
  }

  // Handle arrays (e.g. rent_schedule)
  if (Array.isArray(fieldVal)) {
    if (fieldVal.length === 0) return { displayVal: "Not found", confidence: "not_found" };
    // Format array items nicely
    const items = fieldVal.map((item) => {
      if (typeof item === "object" && item !== null) {
        // Try to format rent schedule items
        const o = item as Record<string, unknown>;
        if (o.year || o.period || o.years) {
          const period = o.year || o.period || o.years || "";
          const rent = o.monthly_rent || o.rent || o.amount || "";
          const perSqft = o.rent_per_sqft || o.per_sqft || "";
          let line = `${period}`;
          if (rent) line += `: Rs ${Number(rent).toLocaleString("en-IN")}/mo`;
          if (perSqft) line += ` (Rs ${perSqft}/sqft)`;
          return line;
        }
        return Object.values(o).join(" | ");
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
};

const processingSteps = [
  { label: "Uploading document", duration: 1500 },
  { label: "Parsing document structure", duration: 2500 },
  { label: "Classifying document type", duration: 2000 },
  { label: "Extracting key terms & dates", duration: 4000 },
  { label: "Analyzing financial data", duration: 3000 },
  { label: "Detecting risk flags", duration: 2000 },
];

function ProcessingStep() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    function advance(index: number) {
      if (index >= processingSteps.length) return;
      timeout = setTimeout(() => {
        setActiveStep(index + 1);
        advance(index + 1);
      }, processingSteps[index].duration);
    }
    advance(0);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Card className="max-w-lg mx-auto">
      <CardContent className="pt-8 pb-10 flex flex-col items-center text-center">
        <div className="mb-6">
          <div className="h-16 w-16 rounded-full bg-neutral-100 flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-black animate-spin" />
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-1">
          {activeStep < processingSteps.length
            ? processingSteps[activeStep].label + "..."
            : "Finalizing extraction..."}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Powered by 360Labs AI Engine
        </p>

        <div className="text-left w-full max-w-xs space-y-3">
          {processingSteps.map((item, i) => (
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
          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min((activeStep / processingSteps.length) * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Step {Math.min(activeStep + 1, processingSteps.length)} of {processingSteps.length}
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

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf") {
      setSelectedFile(file);
      setError(null);
    } else {
      setError("Please upload a PDF file.");
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
      setResult(data);
      setStep(3);
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
      <div className="flex items-center gap-3">
        <Link href="/agreements">
          <Button variant="ghost" size="sm" className="gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upload Agreement</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload a lease, LOI, or license document for AI-powered data extraction
          </p>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-0">
        {[
          { num: 1, label: "Upload Document" },
          { num: 2, label: "AI Processing" },
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
                    ? "bg-black text-white"
                    : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {step > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span
                className={`text-sm font-medium ${
                  step >= s.num ? "text-black" : "text-neutral-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < 3 && (
              <div
                className={`mx-4 h-px w-16 ${
                  step > s.num ? "bg-emerald-600" : "bg-neutral-200"
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

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="max-w-xl mx-auto space-y-6">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-4">Upload Document</h2>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
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
                      ? "border-black bg-neutral-50 scale-[1.01]"
                      : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50/50"
                  }`}
                >
                  <div className="h-14 w-14 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
                    <CloudUpload className="h-7 w-7 text-neutral-400" />
                  </div>
                  <p className="text-sm font-medium text-black mb-1">
                    Drag and drop your PDF here
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    or click to browse files
                  </p>
                  <Badge variant="outline" className="text-xs font-normal">PDF up to 50MB</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl border bg-neutral-50">
                  <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-red-600" />
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
              Start AI Extraction
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 2 && <ProcessingStep />}

      {/* Step 3: Review */}
      {step === 3 && result && (
        <div className="space-y-5">
          {/* Summary bar */}
          <div className="flex items-center gap-4 p-4 rounded-xl border bg-emerald-50/80 border-emerald-200">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">Extraction Complete</p>
              <p className="text-xs text-emerald-700">
                Classified as <strong>{result.document_type.replace(/_/g, " ").toUpperCase()}</strong>
                {stats && <> &middot; {stats.total} fields extracted &middot; {stats.highConf} high confidence</>}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">{result.filename}</Badge>
          </div>

          {/* Stats bar */}
          {stats && (
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg border bg-white">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-[11px] text-muted-foreground">Fields Extracted</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-white">
                <p className="text-2xl font-bold text-emerald-600">{stats.highConf}</p>
                <p className="text-[11px] text-muted-foreground">High Confidence</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-white">
                <p className="text-2xl font-bold text-amber-600">{stats.medConf + stats.lowConf}</p>
                <p className="text-[11px] text-muted-foreground">Needs Review</p>
              </div>
              <div className="text-center p-3 rounded-lg border bg-white">
                <p className="text-2xl font-bold text-red-600">{result.risk_flags.length}</p>
                <p className="text-[11px] text-muted-foreground">Risk Flags</p>
              </div>
            </div>
          )}

          {/* Risk Flags Section */}
          {result.risk_flags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-semibold">Risk Flags Detected</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.risk_flags.map((flag, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      flag.severity === "high"
                        ? "border-red-200 bg-red-50/50"
                        : "border-amber-200 bg-amber-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                          flag.severity === "high" ? "text-red-500" : "text-amber-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium">{flag.name || flag.explanation}</span>
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
                          <p className="text-xs text-muted-foreground">{flag.explanation}</p>
                        )}
                        {flag.clause_text && (
                          <p className="text-xs text-muted-foreground italic mt-1 line-clamp-2">
                            &ldquo;{flag.clause_text}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Extracted Data Sections */}
          <div className="space-y-4">
            {Object.entries(result.extraction).map(([sectionKey, sectionData]) => {
              if (typeof sectionData !== "object" || sectionData === null) return null;
              const fields = Object.entries(sectionData as Record<string, unknown>);
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
                      <h3 className="text-sm font-semibold">{config.title}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                      {fields.map(([fieldKey, fieldVal]) => {
                        const { displayVal, confidence } = parseField(fieldVal);

                        return (
                          <div key={fieldKey} className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <ConfidenceDot level={confidence} />
                              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                {formatFieldLabel(fieldKey)}
                              </p>
                            </div>
                            <EditableField
                              value={displayVal}
                              isNotFound={displayVal === "Not found"}
                              onChange={(newVal) => {
                                setResult((prev) => {
                                  if (!prev) return prev;
                                  const updated = { ...prev, extraction: { ...prev.extraction } };
                                  const section = { ...(updated.extraction[sectionKey] as Record<string, unknown>) };
                                  const existing = section[fieldKey];
                                  // Preserve confidence wrapper
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
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
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
                variant="ghost"
                onClick={() => alert("Draft saved")}
              >
                Save as Draft
              </Button>
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
