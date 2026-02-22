"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  FileText,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CloudUpload,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { uploadAndExtract } from "@/lib/api";

type Confidence = "high" | "medium" | "low" | "not_found";

function confidenceBadge(level: Confidence) {
  const styles: Record<Confidence, { bg: string; label: string }> = {
    high: { bg: "bg-emerald-100 text-emerald-800", label: "High" },
    medium: { bg: "bg-amber-100 text-amber-800", label: "Medium" },
    low: { bg: "bg-red-100 text-red-800", label: "Low" },
    not_found: { bg: "bg-neutral-100 text-neutral-500", label: "N/A" },
  };
  const s = styles[level] || styles.not_found;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.bg}`}>
      {s.label}
    </span>
  );
}

function formatFieldLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Sqft", "(sqft)")
    .replace("Pct", "%")
    .replace("Per Kw", "per KW");
}

function formatSectionTitle(key: string): string {
  const titles: Record<string, string> = {
    parties: "Parties",
    premises: "Premises",
    lease_term: "Lease Term",
    rent: "Rent & Revenue",
    charges: "Charges & CAM",
    deposits: "Deposits",
    legal: "Legal & Escalation",
    franchise: "Franchise Details",
  };
  return titles[key] || formatFieldLabel(key);
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
  }>;
  filename: string;
};

export default function UploadAgreementPage() {
  const [step, setStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
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

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
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
            {i < 2 && (
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
          <div>
            <p className="text-sm font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setError(null)}>
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
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-12 cursor-pointer transition-colors ${
                    isDragOver
                      ? "border-black bg-neutral-50"
                      : "border-neutral-300 hover:border-neutral-400"
                  }`}
                >
                  <CloudUpload className="h-10 w-10 text-neutral-400 mb-3" />
                  <p className="text-sm font-medium text-black mb-1">
                    Drag and drop your PDF here
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    or click to browse files
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supported: PDF up to 50MB
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-lg border bg-neutral-50">
                  <FileText className="h-8 w-8 text-red-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)} -- PDF Document
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
              className="gap-2"
            >
              Start AI Extraction
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 2 && (
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-8 pb-10 flex flex-col items-center text-center">
            <div className="mb-6">
              <div className="h-16 w-16 rounded-full bg-neutral-100 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-black animate-spin" />
              </div>
            </div>

            <h2 className="text-lg font-semibold mb-1">AI is extracting data...</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Parsing document, extracting terms, dates, financial data, and analyzing risk flags.
              This may take 15-30 seconds.
            </p>

            <div className="text-left w-full max-w-xs space-y-2">
              {[
                "Uploading document to AI...",
                "Parsing document structure...",
                "Classifying document type...",
                "Extracting key terms and dates...",
                "Analyzing financial data...",
                "Detecting risk flags...",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm opacity-60">
                  <div className="h-3.5 w-3.5 rounded-full border border-neutral-300 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && result && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="flex items-center gap-4 p-4 rounded-lg border bg-emerald-50 border-emerald-200">
            <Check className="h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-800">Extraction Complete</p>
              <p className="text-xs text-emerald-700">
                Document classified as <strong>{result.document_type.replace(/_/g, " ")}</strong> --{" "}
                {result.risk_flags.length > 0
                  ? `${result.risk_flags.length} risk flag(s) detected`
                  : "No risk flags detected"}
              </p>
            </div>
            <Badge variant="outline">{result.filename}</Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
            {/* Left: Risk Flags */}
            <div className="space-y-4">
              <h2 className="text-base font-semibold">Risk Flags</h2>
              {result.risk_flags.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Check className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-medium">No risk flags detected</p>
                    <p className="text-xs text-muted-foreground">This document looks clean.</p>
                  </CardContent>
                </Card>
              ) : (
                result.risk_flags.map((flag, i) => (
                  <Card key={i} className={flag.severity === "high" ? "border-red-200" : "border-amber-200"}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                            flag.severity === "high" ? "text-red-500" : "text-amber-500"
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold">{flag.explanation}</span>
                            <Badge
                              variant="outline"
                              className={
                                flag.severity === "high"
                                  ? "border-red-300 text-red-700 text-[10px]"
                                  : "border-amber-300 text-amber-700 text-[10px]"
                              }
                            >
                              {flag.severity}
                            </Badge>
                          </div>
                          {flag.clause_text && (
                            <p className="text-xs text-muted-foreground italic">
                              &ldquo;{flag.clause_text}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Right: Extracted Fields */}
            <div className="overflow-y-auto space-y-4 pr-1">
              <div className="flex items-center justify-between sticky top-0 bg-neutral-50/95 backdrop-blur-sm py-2 z-10">
                <h2 className="text-base font-semibold">Extracted Data</h2>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> High
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" /> Medium
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Low
                  </span>
                </div>
              </div>

              {Object.entries(result.extraction).map(([sectionKey, sectionData]) => {
                if (typeof sectionData !== "object" || sectionData === null) return null;
                const fields = Object.entries(sectionData as Record<string, unknown>).filter(
                  ([k]) => !k.endsWith("_confidence")
                );
                if (fields.length === 0) return null;

                return (
                  <Card key={sectionKey}>
                    <CardContent className="pt-4 pb-3">
                      <h3 className="text-sm font-semibold mb-3 text-black">
                        {formatSectionTitle(sectionKey)}
                      </h3>
                      <div className="space-y-2">
                        {fields.map(([fieldKey, fieldVal]) => {
                          const displayVal =
                            fieldVal === null || fieldVal === "" || fieldVal === "not_found"
                              ? "Not found"
                              : typeof fieldVal === "object"
                              ? JSON.stringify(fieldVal, null, 2)
                              : String(fieldVal);
                          const conf = (result.confidence[fieldKey] || "not_found") as Confidence;

                          return (
                            <div key={fieldKey} className="flex items-start justify-between gap-4 py-1">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-muted-foreground">{formatFieldLabel(fieldKey)}</p>
                                <p className="text-sm font-medium text-black whitespace-pre-wrap break-words">
                                  {displayVal}
                                </p>
                              </div>
                              {confidenceBadge(conf)}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Action Bar */}
          <Separator />
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setStep(1);
                setResult(null);
                setSelectedFile(null);
              }}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Upload Another
            </Button>
            <div className="flex items-center gap-3">
              <Link href="/agreements">
                <Button variant="outline">Back to Agreements</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
