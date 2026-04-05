"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listExtractionJobs, markExtractionJobSeen, cancelExtractionJob } from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Cpu,
  RefreshCw,
  Info,
} from "lucide-react";

interface ExtractionJob {
  id: string;
  filename: string;
  status: "processing" | "completed" | "failed" | "cancelled";
  created_at: string;
  updated_at?: string;
  seen?: boolean;
  result?: {
    processing_duration_seconds?: number;
    extraction?: Record<string, unknown>;
    document_type?: string;
  };
  error?: string;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function estimateProcessingTime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") {
    return "~2-4 min";
  }
  return "~1-2 min";
}

export default function ProcessingPage() {
  useUser();
  const [jobs, setJobs] = useState<ExtractionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchJobs() {
    try {
      const data = await listExtractionJobs({});
      setJobs(data.jobs || []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchJobs();
  }, []);

  // Only poll when there are active processing jobs
  useEffect(() => {
    const hasProcessing = jobs.some((j) => j.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

  async function handleMarkSeen(jobId: string) {
    try {
      await markExtractionJobSeen(jobId);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, seen: true } : j)));
    } catch {
      // Silently fail
    }
  }

  const processingJobs = jobs.filter((j) => j.status === "processing");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed" || j.status === "cancelled");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <PageHeader
        title="Extractions"
        description="Track your document extractions — processing happens in the background"
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setRefreshing(true);
            fetchJobs();
          }}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Link href="/agreements/upload">
          <Button size="sm" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Upload New
          </Button>
        </Link>
      </PageHeader>

      {/* How it works — info card */}
      <Card className="border-blue-200/60 bg-blue-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-medium">How document processing works</p>
              <ul className="text-xs text-blue-700 space-y-0.5 list-disc list-inside">
                <li>Upload your PDF and processing starts automatically in the background</li>
                <li>You can close this page — extraction continues on the server</li>
                <li><strong>Text PDFs:</strong> ~1-3 minutes (extracted directly)</li>
                <li><strong>Scanned PDFs:</strong> ~5-15 minutes (OCR + AI extraction)</li>
                <li><strong>50+ page complex docs:</strong> ~15-20 minutes</li>
                <li>You&apos;ll see a notification banner when results are ready</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Currently Processing */}
      {processingJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            Processing ({processingJobs.length})
          </h2>
          <div className="space-y-2">
            {processingJobs.map((job) => (
              <Card key={job.id} className="border-amber-200/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <Loader2 className="h-4 w-4 text-amber-600 animate-spin" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{job.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        Started {formatTimeAgo(job.created_at)} &middot; Est. {estimateProcessingTime(job.filename)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={async () => {
                        try {
                          await cancelExtractionJob(job.id);
                          setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: "cancelled" as ExtractionJob["status"] } : j));
                        } catch { /* ignore */ }
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {/* Progress bar animation */}
                  <div className="mt-3 h-1.5 w-full rounded-full bg-amber-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 animate-pulse"
                      style={{ width: "60%", transition: "width 2s ease" }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completedJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Completed ({completedJobs.length})
          </h2>
          <div className="space-y-2">
            {completedJobs.map((job) => {
              const duration = job.result?.processing_duration_seconds;
              const sections = job.result?.extraction ? Object.keys(job.result.extraction).length : 0;
              const docType = job.result?.document_type || "unknown";
              return (
                <Card key={job.id} className={!job.seen ? "border-emerald-200/60 bg-emerald-50/20" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeAgo(job.updated_at || job.created_at)}
                          {duration ? ` · Processed in ${formatDuration(duration)}` : ""}
                          {sections > 0 ? ` · ${sections} sections` : ""}
                          {docType !== "unknown" ? ` · ${docType.replace(/_/g, " ")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!job.seen && (
                          <Badge className="bg-emerald-500 text-white text-[10px]">New</Badge>
                        )}
                        <Link href={`/agreements/upload?job_id=${job.id}`} onClick={() => handleMarkSeen(job.id)}>
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                            View Results
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Failed */}
      {failedJobs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-rose-500" />
            Failed ({failedJobs.length})
          </h2>
          <div className="space-y-2">
            {failedJobs.map((job) => (
              <Card key={job.id} className="border-rose-200/60">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                      <XCircle className="h-4 w-4 text-rose-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{job.filename}</p>
                      <p className="text-xs text-rose-600 truncate">
                        {job.error || "Extraction failed"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatTimeAgo(job.updated_at || job.created_at)}
                      </p>
                    </div>
                    <Link href="/agreements/upload">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                        Retry
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {jobs.length === 0 && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Cpu className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-1">No documents processed yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Upload a lease agreement or license document to start. Processing happens in the background — you can close the tab and come back later.
            </p>
            <Link href="/agreements/upload">
              <Button className="gap-1.5">
                <FileText className="h-4 w-4" />
                Upload Document
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
