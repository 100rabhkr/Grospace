"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  CloudUpload,
  X,
  AlertTriangle,
  Shield,
  Loader2,
  Check,
  Sparkles,
  Clock,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { analyzeLeasebot } from "@/lib/api";
import Image from "next/image";
import Link from "next/link";

const processingSteps = [
  { label: "Reading document (OCR)", duration: 2000 },
  { label: "Classifying document type", duration: 2500 },
  { label: "Extracting key terms", duration: 4000 },
  { label: "Analyzing risk flags", duration: 3000 },
];

function ProcessingAnimation() {
  const [activeStep, setActiveStep] = useState(0);

  useState(() => {
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
  });

  return (
    <Card className="max-w-md mx-auto">
      <CardContent className="pt-8 pb-10 flex flex-col items-center text-center">
        <div className="mb-6">
          <div className="h-16 w-16 rounded-full bg-[#132337] flex items-center justify-center">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          </div>
        </div>

        <h2 className="text-lg font-semibold mb-1 text-[#132337]">
          Analyzing your lease...
        </h2>
        <p className="text-sm text-[#6b7280] mb-6">
          AI-powered analysis in progress
        </p>

        <div className="text-left w-full max-w-xs space-y-3">
          {processingSteps.map((item, i) => (
            <div
              key={item.label}
              className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${
                i < activeStep
                  ? "text-[#132337]"
                  : i === activeStep
                  ? "text-[#132337]"
                  : "text-[#9ca3af] opacity-40"
              }`}
            >
              {i < activeStep ? (
                <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              ) : i === activeStep ? (
                <Loader2 className="h-4 w-4 text-[#132337] animate-spin flex-shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border border-[#d1d5db] flex-shrink-0" />
              )}
              <span className={i < activeStep ? "font-medium" : ""}>{item.label}</span>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-[#9ca3af]">
          This usually takes 60-90 seconds
        </p>
      </CardContent>
    </Card>
  );
}

export default function LeasebotPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(document.cookie.includes("grospace-demo-session=authenticated"));
  }, []);

  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isValidFile(file: File): boolean {
    if (file.size > MAX_FILE_SIZE) return false;
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = Array.from(e.dataTransfer.files)[0];
    if (file && isValidFile(file)) {
      setSelectedFile(file);
      setError(null);
    } else if (file && file.size > MAX_FILE_SIZE) {
      setError(`File is too large (${formatFileSize(file.size)}). Maximum size is 50MB.`);
    } else {
      setError("Please upload a PDF file.");
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      setSelectedFile(file);
      setError(null);
    } else if (file) {
      setError("Please upload a PDF file.");
    }
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAnalyze() {
    if (!selectedFile) return;
    setIsProcessing(true);
    setError(null);

    try {
      const data = await analyzeLeasebot(selectedFile);
      if (data.token) {
        router.push(`/leasebot/results/${data.token}`);
      } else {
        setError("Analysis failed. Please try again.");
        setIsProcessing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please try again.");
      setIsProcessing(false);
    }
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-[#fafbfd] flex items-center justify-center p-4">
        <ProcessingAnimation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafbfd]">
      {/* Header */}
      <header className="border-b border-[#e4e8ef] bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="GroSpace" width={28} height={28} className="rounded-md" />
            <span className="text-[17px] font-semibold tracking-tight text-[#132337]">GroSpace</span>
          </Link>
          {isLoggedIn ? (
            <Link href="/">
              <Button variant="outline" size="sm">
                Dashboard
              </Button>
            </Link>
          ) : (
            <Link href="/auth/login?redirect=/leasebot">
              <Button variant="outline" size="sm">
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#132337]/5 text-[#132337] text-xs font-medium mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          Free AI-Powered Lease Analysis
        </div>

        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#132337] tracking-tight mb-4">
          Review Your Lease
          <br />
          Before You Sign
        </h1>

        <p className="text-lg text-[#6b7280] max-w-xl mx-auto mb-10">
          AI-powered lease analysis in 90 seconds. Get a health score,
          risk flags, and key terms extracted automatically.
        </p>

        {/* Upload Area */}
        <div className="max-w-lg mx-auto">
          <Card className="border-2 border-[#e4e8ef]">
            <CardContent className="pt-6 pb-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              {!selectedFile ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 cursor-pointer transition-all ${
                    isDragOver
                      ? "border-[#132337] bg-[#132337]/5 scale-[1.01]"
                      : "border-[#d1d5db] hover:border-[#9ca3af] hover:bg-[#f4f6f9]/50"
                  }`}
                >
                  <div className="h-14 w-14 rounded-full bg-[#f4f6f9] flex items-center justify-center mb-4">
                    <CloudUpload className="h-7 w-7 text-[#9ca3af]" />
                  </div>
                  <p className="text-sm font-medium text-[#132337] mb-1">
                    Drag and drop your lease PDF here
                  </p>
                  <p className="text-xs text-[#9ca3af] mb-3">
                    or click to browse files
                  </p>
                  <Badge variant="outline" className="text-xs font-normal">
                    PDF up to 50MB
                  </Badge>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-xl border bg-[#f4f6f9]">
                    <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-[#9ca3af]">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                      className="h-8 w-8 p-0 text-[#9ca3af] hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button
                    onClick={handleAnalyze}
                    className="w-full gap-2 bg-[#132337] hover:bg-[#1a2f47] text-white"
                    size="lg"
                  >
                    <Sparkles className="h-4 w-4" />
                    Analyze My Lease
                  </Button>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-[#9ca3af] mt-3">
            No sign-up required. Your document is processed securely and deleted after 30 days.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="text-center p-6 rounded-xl border border-[#e4e8ef] bg-white">
            <div className="h-10 w-10 rounded-full bg-[#132337]/5 flex items-center justify-center mx-auto mb-3">
              <Shield className="h-5 w-5 text-[#132337]" />
            </div>
            <h3 className="text-sm font-semibold text-[#132337] mb-1">Health Score</h3>
            <p className="text-xs text-[#6b7280]">
              Get a 0-100 score that tells you how favorable your lease terms are.
            </p>
          </div>

          <div className="text-center p-6 rounded-xl border border-[#e4e8ef] bg-white">
            <div className="h-10 w-10 rounded-full bg-[#132337]/5 flex items-center justify-center mx-auto mb-3">
              <Eye className="h-5 w-5 text-[#132337]" />
            </div>
            <h3 className="text-sm font-semibold text-[#132337] mb-1">Key Terms</h3>
            <p className="text-xs text-[#6b7280]">
              Property details, rent, deposits, and dates extracted automatically.
            </p>
          </div>

          <div className="text-center p-6 rounded-xl border border-[#e4e8ef] bg-white">
            <div className="h-10 w-10 rounded-full bg-[#132337]/5 flex items-center justify-center mx-auto mb-3">
              <Clock className="h-5 w-5 text-[#132337]" />
            </div>
            <h3 className="text-sm font-semibold text-[#132337] mb-1">90 Seconds</h3>
            <p className="text-xs text-[#6b7280]">
              Full analysis in under 2 minutes. No manual review needed.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e4e8ef] bg-white py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <p className="text-xs text-[#9ca3af]">
            Powered by GroSpace AI
          </p>
          <Link href={isLoggedIn ? "/" : "/auth/login?redirect=/leasebot"} className="text-xs text-[#132337] font-medium hover:underline">
            {isLoggedIn ? "Go to Dashboard" : "Sign in for full access"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
