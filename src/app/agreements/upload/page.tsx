"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CloudUpload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { outlets } from "@/lib/mock-data";

// Sample extracted data from GFB Felix Plaza agreement (agr-1)
const sampleExtractedData = {
  parties: {
    sectionTitle: "Parties",
    fields: [
      { label: "Lessor", value: "Felix Plaza AOP", confidence: "high" as const },
      { label: "Lessee", value: "Good Flippin Foods Pvt Ltd", confidence: "high" as const },
      { label: "Brand Name", value: "Good Flippin' Burgers", confidence: "high" as const },
      { label: "Franchise Model", value: "FOCO", confidence: "medium" as const },
    ],
  },
  premises: {
    sectionTitle: "Premises",
    fields: [
      { label: "Address", value: "Felix Plaza, Sector 82A, Gurugram, Haryana-122001", confidence: "high" as const },
      { label: "Floor", value: "Third Floor", confidence: "high" as const },
      { label: "Unit Number", value: "1068", confidence: "high" as const },
      { label: "Super Area (sqft)", value: "594", confidence: "high" as const },
      { label: "Covered Area (sqft)", value: "1,188", confidence: "medium" as const },
      { label: "Property Type", value: "Mall", confidence: "high" as const },
    ],
  },
  leaseTerm: {
    sectionTitle: "Lease Term",
    fields: [
      { label: "Lease Commencement", value: "4 Oct 2024", confidence: "high" as const },
      { label: "Rent Commencement", value: "4 Dec 2024", confidence: "high" as const },
      { label: "Lease Expiry", value: "3 Oct 2030", confidence: "high" as const },
      { label: "Lock-in Period End", value: "3 Oct 2026", confidence: "high" as const },
      { label: "Rent-Free Period", value: "2 months", confidence: "medium" as const },
      { label: "Lease Duration", value: "6 years", confidence: "high" as const },
    ],
  },
  rent: {
    sectionTitle: "Rent & Revenue Share",
    fields: [
      { label: "Rent Model", value: "Hybrid (MGLR)", confidence: "high" as const },
      { label: "Monthly Base Rent", value: "Rs 53,460", confidence: "high" as const },
      { label: "Rent per Sqft", value: "Rs 90", confidence: "high" as const },
      { label: "Revenue Share (Dine-in)", value: "15%", confidence: "medium" as const },
      { label: "Revenue Share (Delivery)", value: "11%", confidence: "medium" as const },
      { label: "Revenue Share Cap", value: "Not specified", confidence: "low" as const },
    ],
  },
  charges: {
    sectionTitle: "Charges & CAM",
    fields: [
      { label: "CAM Monthly", value: "Rs 41,580", confidence: "high" as const },
      { label: "CAM per Sqft", value: "Rs 70", confidence: "high" as const },
      { label: "Total Monthly Outflow", value: "Rs 95,040", confidence: "high" as const },
      { label: "HVAC Charges", value: "Included in CAM", confidence: "low" as const },
      { label: "Electricity", value: "Actual, metered separately", confidence: "medium" as const },
    ],
  },
  deposits: {
    sectionTitle: "Deposits",
    fields: [
      { label: "Security Deposit", value: "Rs 7,84,080", confidence: "high" as const },
      { label: "Deposit Calculation", value: "6 months rent + 6 months CAM", confidence: "medium" as const },
      { label: "Deposit Refund", value: "Within 60 days of termination", confidence: "medium" as const },
    ],
  },
  legal: {
    sectionTitle: "Legal & Escalation",
    fields: [
      { label: "Escalation", value: "15% every 3 years", confidence: "high" as const },
      { label: "Termination Notice", value: "6 months", confidence: "high" as const },
      { label: "Jurisdiction", value: "Gurugram Courts", confidence: "high" as const },
      { label: "Governing Law", value: "Indian Law", confidence: "low" as const },
      { label: "Subletting Allowed", value: "No", confidence: "medium" as const },
    ],
  },
};

type Confidence = "high" | "medium" | "low" | "undetected";

function confidenceBadge(level: Confidence) {
  const styles: Record<Confidence, { bg: string; label: string }> = {
    high: { bg: "bg-emerald-100 text-emerald-800", label: "High" },
    medium: { bg: "bg-amber-100 text-amber-800", label: "Medium" },
    low: { bg: "bg-red-100 text-red-800", label: "Low" },
    undetected: { bg: "bg-neutral-100 text-neutral-500", label: "N/A" },
  };
  const s = styles[level];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.bg}`}>
      {s.label}
    </span>
  );
}

export default function UploadAgreementPage() {
  const [step, setStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  // Simulate processing progress when on step 2
  useEffect(() => {
    if (step !== 2) return;
    setProcessingProgress(0);
    const interval = setInterval(() => {
      setProcessingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Variable speed: slower near the end
        const increment = prev < 60 ? 4 : prev < 85 ? 2 : 1;
        return Math.min(prev + increment, 100);
      });
    }, 120);
    return () => clearInterval(interval);
  }, [step]);

  // Auto-advance from step 2 to step 3 when processing completes
  useEffect(() => {
    if (step === 2 && processingProgress >= 100) {
      const timeout = setTimeout(() => setStep(3), 800);
      return () => clearTimeout(timeout);
    }
  }, [step, processingProgress]);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    setUploadedFile("GFB_Felix_Plaza_LOI.pdf");
  }

  function handleFileSelect() {
    setUploadedFile("GFB_Felix_Plaza_LOI.pdf");
  }

  function handleRemoveFile() {
    setUploadedFile(null);
  }

  const canProceedStep1 = uploadedFile && selectedOutlet;

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

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: File Upload */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-4">Upload Document</h2>
              {!uploadedFile ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={handleFileSelect}
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
                    <p className="text-sm font-medium truncate">{uploadedFile}</p>
                    <p className="text-xs text-muted-foreground">2.4 MB -- PDF Document</p>
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

          {/* Right: Outlet Selection */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-4">Link to Outlet</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Select an existing outlet or create a new one to associate with this agreement.
              </p>
              <Select value={selectedOutlet} onValueChange={setSelectedOutlet}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an outlet..." />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((outlet) => (
                    <SelectItem key={outlet.id} value={outlet.id}>
                      <span className="flex items-center gap-2">
                        {outlet.name}
                        <span className="text-xs text-muted-foreground">
                          -- {outlet.city}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Separator className="my-6" />

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-neutral-200" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-neutral-200" />
              </div>

              <Button variant="outline" className="w-full mt-4 gap-2" disabled>
                <span className="text-sm">Create New Outlet</span>
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Outlet details will be auto-populated from the extracted data
              </p>
            </CardContent>
          </Card>

          {/* Action Bar */}
          <div className="lg:col-span-2 flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="gap-2"
            >
              Start Extraction
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Processing */}
      {step === 2 && (
        <Card className="max-w-lg mx-auto">
          <CardContent className="pt-8 pb-10 flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-full bg-neutral-100 flex items-center justify-center">
                <Loader2 className={`h-8 w-8 text-black ${processingProgress < 100 ? "animate-spin" : ""}`} />
              </div>
              {processingProgress >= 100 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Check className="h-8 w-8 text-emerald-600" />
                  </div>
                </div>
              )}
            </div>

            <h2 className="text-lg font-semibold mb-1">
              {processingProgress < 100
                ? "AI is extracting data..."
                : "Extraction Complete"}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {processingProgress < 30
                ? "Parsing document structure and identifying clauses..."
                : processingProgress < 60
                ? "Extracting key terms, dates, and financial data..."
                : processingProgress < 85
                ? "Analyzing risk flags and obligations..."
                : processingProgress < 100
                ? "Validating extracted data and confidence scores..."
                : "All data has been extracted. Proceeding to review..."}
            </p>

            <div className="w-full max-w-xs space-y-2">
              <Progress value={processingProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">{processingProgress}% complete</p>
            </div>

            <div className="mt-6 text-left w-full max-w-xs space-y-2">
              {[
                { label: "Document parsed", threshold: 20 },
                { label: "Parties identified", threshold: 40 },
                { label: "Financial terms extracted", threshold: 60 },
                { label: "Dates and periods mapped", threshold: 75 },
                { label: "Risk flags analyzed", threshold: 90 },
                { label: "Obligations generated", threshold: 100 },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 text-sm transition-opacity ${
                    processingProgress >= item.threshold
                      ? "opacity-100"
                      : "opacity-30"
                  }`}
                >
                  {processingProgress >= item.threshold ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border border-neutral-300 flex-shrink-0" />
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-340px)] min-h-[600px]">
            {/* Left: PDF Viewer Placeholder */}
            <Card className="flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium">GFB_Felix_Plaza_LOI.pdf</span>
                </div>
                <Badge variant="outline" className="text-xs">12 pages</Badge>
              </div>
              <CardContent className="flex-1 flex items-center justify-center bg-neutral-50 p-0">
                <div className="text-center space-y-3">
                  <FileText className="h-16 w-16 text-neutral-300 mx-auto" />
                  <div>
                    <p className="text-sm font-medium text-neutral-500">PDF Viewer</p>
                    <p className="text-xs text-muted-foreground">
                      Document preview will render here
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

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
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-neutral-300" /> N/A
                  </span>
                </div>
              </div>

              {Object.values(sampleExtractedData).map((section) => (
                <Card key={section.sectionTitle}>
                  <CardContent className="pt-4 pb-3">
                    <h3 className="text-sm font-semibold mb-3 text-black">
                      {section.sectionTitle}
                    </h3>
                    <div className="space-y-2">
                      {section.fields.map((field) => (
                        <div
                          key={field.label}
                          className="flex items-start justify-between gap-4 py-1"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">{field.label}</p>
                            <p className="text-sm font-medium text-black truncate">
                              {field.value}
                            </p>
                          </div>
                          {confidenceBadge(field.confidence)}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Re-upload
            </Button>
            <div className="flex items-center gap-3">
              <Link href="/agreements">
                <Button variant="outline">Save as Draft</Button>
              </Link>
              <Link href="/agreements/agr-1">
                <Button className="gap-2">
                  <Check className="h-4 w-4" />
                  Confirm & Activate
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
