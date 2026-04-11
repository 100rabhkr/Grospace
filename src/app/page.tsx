"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { getDashboardStats, smartChat, listOutlets, listPayments, updatePayment, listAgreements, getOrgMembers, logUsage, listUpcomingEvents, listOrganizations } from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import { HealthScoreGauge } from "@/components/health-score-gauge";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/kpi-card";
import { Stagger, StaggerItem, Counter } from "@/components/motion";
import {
  Store,
  FileCheck,
  IndianRupee,
  Bell,
  Wallet,
  CalendarClock,
  ShieldAlert,
  Upload,
  AlertTriangle,
  BarChart3,
  Rocket,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  User,
  MapPin,
  Shield,
  Users,
  Activity,
  Settings,
  ChevronDown,
  ChevronRight,
  Map,
  TrendingUp,
  FileText,
  Lightbulb,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Heart,
  Bot,
  Plus,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canWrite, type UserRole } from "@/components/navigation-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardStats {
  total_outlets: number;
  total_agreements: number;
  active_agreements: number;
  total_monthly_rent: number;
  total_monthly_outflow: number;
  total_risk_flags: number;
  pending_alerts: number;
  expiring_leases_90d: number;
  expiring_licenses_30d: number;
  expiring_licenses_60d: number;
  expiring_licenses_90d: number;
  outlets_by_city: Record<string, number>;
  outlets_by_status: Record<string, number>;
  outlet_details_by_city?: Record<string, { id?: string; name: string; status: string; rent?: number }[]>;
  overdue_payments_count?: number;
  overdue_amount?: number;
  pipeline_stages?: Record<string, number>;
  outlets_by_property_type?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a number as Indian currency: ₹1,06,920 */
function formatINR(amount: number): string {
  // Indian numbering: last 3 digits grouped, then every 2 digits
  const str = Math.round(amount).toString();
  if (str.length <= 3) return `₹${str}`;
  const last3 = str.slice(-3);
  const rest = str.slice(0, -3);
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${withCommas},${last3}`;
}

/** Pretty-print a status key like "fit_out" -> "Fit Out" */
function statusLabel(key: string): string {
  if (!key) return "Unknown";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Return hex color for outlet status (for pie chart) */
function statusColor(status: string): string {
  switch (status) {
    case "operational": return "#10b981";
    case "fit_out": return "#f59e0b";
    case "closed": return "#ef4444";
    case "under_construction": return "#3b82f6";
    default: return "#94a3b8";
  }
}

/** Return hex color for property type (for bar chart) */
function propertyTypeColor(type: string): string {
  switch (type) {
    case "mall": return "#8b5cf6";
    case "high_street": return "#3b82f6";
    case "standalone": return "#10b981";
    case "food_court": return "#f59e0b";
    case "cloud_kitchen": return "#ef4444";
    case "institutional": return "#06b6d4";
    default: return "#94a3b8";
  }
}

/** Simple SVG donut chart */
// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-border/50 ${className ?? ""}`}
    />
  );
}

function StatCardSkeleton() {
  return (
    <Card className="rounded-2xl border-border/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-6">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent className="p-6 pt-0">
        <SkeletonBlock className="h-8 w-20 mb-2" />
        <SkeletonBlock className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <SkeletonBlock className="h-5 w-28 mb-1.5" />
        <SkeletonBlock className="h-3 w-52" />
      </div>

      {/* Row 1 - 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 2 - 3 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 lg:gap-6">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 3 - 2 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
        <Card>
          <CardHeader className="p-4 pb-2">
            <SkeletonBlock className="h-4 w-28" />
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <SkeletonBlock className="h-6 w-full" />
            <SkeletonBlock className="h-6 w-full" />
            <SkeletonBlock className="h-6 w-3/4" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <SkeletonBlock className="h-4 w-32" />
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-[12.5px] text-muted-foreground font-normal">
          Welcome to GroSpace. Let&apos;s get your first outlet set up.
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Rocket className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Create your first outlet</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            The flow is simple: add an outlet, upload its signed lease,
            review the extracted details, and GroSpace will auto-create
            events, reminders and payments for you.
          </p>
          <div className="flex gap-3">
            <Link href="/outlets?action=create">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add Outlet
              </Button>
            </Link>
            <Link href="/pipeline">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4" />
                Or track a lead
              </Button>
            </Link>
          </div>
          <div className="mt-6 pt-6 border-t border-border w-full max-w-md">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Step 1 · Add outlet &nbsp;→&nbsp; Step 2 · Upload lease &nbsp;→&nbsp;
              Step 3 · Review extraction &nbsp;→&nbsp; Step 4 · Activate
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Chat Message Type
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

// ---------------------------------------------------------------------------
// Gro AI Chat Component
// ---------------------------------------------------------------------------

function SmartAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  async function handleSend(question?: string) {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const data = await smartChat(q);
      setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `Sorry, I couldn't process that. ${err instanceof Error ? err.message : "Please try again."}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const suggestionCategories = [
    {
      icon: TrendingUp,
      label: "Portfolio",
      questions: [
        "Give me a complete portfolio overview",
        "What's my total monthly outflow?",
      ],
    },
    {
      icon: AlertTriangle,
      label: "Risks",
      questions: [
        "Which leases expire in the next 90 days?",
        "Show me all high-risk agreements",
      ],
    },
    {
      icon: FileText,
      label: "Agreements",
      questions: [
        "Summarize my active lease agreements",
        "Which outlets have revenue share models?",
      ],
    },
    {
      icon: Lightbulb,
      label: "Insights",
      questions: [
        "Recommendations to reduce costs?",
        "What's my portfolio health score?",
      ],
    },
  ];

  const followUpSuggestions = [
    "Show overdue payments",
    "Portfolio health",
    "Expiring leases",
    "Cost breakdown",
  ];

  function formatAIContent(content: string) {
    const lines = content.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) {
        return (
          <p key={i} className="font-semibold text-sm mt-2 mb-1">
            {line.replace(/\*\*/g, "")}
          </p>
        );
      }
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return (
          <li key={i} className="text-sm text-foreground ml-4 list-disc">
            {line.replace(/^[-•]\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1")}
          </li>
        );
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return (
        <p key={i} className="text-sm text-foreground">
          {line.replace(/\*\*(.*?)\*\*/g, "$1")}
        </p>
      );
    });
  }

  return (
    <Card className="rounded-2xl border-border/10 overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300">
      <CardHeader
        className={cn(
          "p-6 pb-4 cursor-pointer transition-colors",
          isOpen ? "bg-primary text-white" : "hover:bg-muted/50"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-xl flex items-center justify-center shadow-sm",
              isOpen ? "bg-white/20" : "bg-primary/10"
            )}>
              <Sparkles className={cn("h-4 w-4", isOpen ? "text-white" : "text-primary")} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold tracking-tight">Gro AI Assistant</CardTitle>
              <p className={cn("text-[11px] mt-0.5 font-medium", isOpen ? "text-white/80" : "text-muted-foreground")}>
                Ask anything about your portfolio — escalation, risk, payments, expiry
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/ai-assistant"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all",
                isOpen ? "bg-white/10 text-white hover:bg-white/20" : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
              )}
            >
              Full View <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center transition-transform",
              isOpen && "rotate-180"
            )}>
              <ChevronDown className={cn("h-4 w-4", isOpen ? "text-white" : "text-muted-foreground")} />
            </div>
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-6 pt-4 animate-in fade-in zoom-in-95 duration-300">
          {/* Chat Messages */}
          <div className="border border-border/40 rounded-3xl bg-muted/30 h-[380px] overflow-y-auto p-5 mb-5 space-y-4 scrollbar-hide">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">Ask your portfolio a question</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">Pick a category below or type your own question to get started.</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "ai" && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-white shadow-sm"
                      : "bg-card border border-border/10 text-foreground shadow-sm"
                  )}
                >
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div>{formatAIContent(msg.content)}</div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5 border border-border/10 shadow-sm">
                    <User className="w-4 h-4 text-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="bg-card border border-border/10 rounded-xl px-4 py-2.5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-[13.5px] text-muted-foreground font-medium">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Categorized Suggestions (when no messages) */}
          {messages.length === 0 && (
            <div className="mb-5">
              {/* Category tabs */}
              <div className="flex flex-wrap gap-2 mb-4">
                {suggestionCategories.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.label;
                  return (
                    <button
                      key={cat.label}
                      onClick={() => setActiveCategory(isActive ? null : cat.label)}
                      className={cn(
                        "flex items-center gap-2 text-[12px] font-semibold px-4 py-2 rounded-full border transition-all duration-300",
                        isActive
                          ? "bg-primary text-white border-primary shadow-lg"
                          : "bg-muted text-muted-foreground border-border/10 hover:bg-muted-foreground/10"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              {/* Questions for active category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {((activeCategory ? suggestionCategories.find((c) => c.label === activeCategory)?.questions : suggestionCategories.flatMap((c) => c.questions.slice(0, 1))) || []).map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    disabled={loading}
                    className="text-start text-[13px] bg-card border border-border/10 rounded-2xl px-4 py-3 text-foreground hover:bg-muted hover:border-primary/20 transition-all duration-300 disabled:opacity-50 group shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex-1 font-medium">{q}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up suggestions (when conversation active) */}
          {messages.length > 0 && !loading && (
            <div className="flex gap-2 mb-5 overflow-x-auto scrollbar-hide pb-1">
              {followUpSuggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="text-[12px] font-semibold text-muted-foreground hover:text-primary border border-border/40 rounded-full px-4 py-2 whitespace-nowrap transition-all hover:bg-primary/5 hover:border-primary/20 disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-3">
            <div className="flex-1 relative group">
              <Input
                ref={inputRef}
                placeholder="Ask about your portfolio..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="w-full text-[13.5px] h-12 rounded-2xl px-4 bg-muted/40 border-border/10 focus:ring-primary/20 focus:border-primary/30 transition-all duration-300 font-medium"
                disabled={loading}
              />
            </div>
            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="h-12 w-12 rounded-2xl shadow-md hover:shadow-lg transition-all active:scale-95"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { user } = useUser();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyTypeCounts, setPropertyTypeCounts] = useState<Record<string, number>>({});

  // Upcoming Events state
  const [upcomingEvents, setUpcomingEvents] = useState<Record<string, unknown>[]>([]);

  // Due This Week state
  const [dueThisWeek, setDueThisWeek] = useState<{
    items: { id: string; outlet_name: string; type: string; amount: number; due_date: string }[];
    total: number;
    totalAmount: number;
  }>({ items: [], total: 0, totalAmount: 0 });
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  // Health Score state
  const [avgHealthScore, setAvgHealthScore] = useState<number | null>(null);

  // Onboarding state
  const [onboardingData, setOnboardingData] = useState<{
    totalAgreements: number;
    hasConfirmedExtraction: boolean;
    orgMemberCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        setLoading(true);
        setError(null);
        const data = await getDashboardStats();
        if (!cancelled) {
          setStats(data);
          logUsage("dashboard_view");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch outlets to compute property type breakdown
  useEffect(() => {
    let cancelled = false;

    async function fetchPropertyTypes() {
      try {
        // If stats already has property type data, use it
        if (stats?.outlets_by_property_type && Object.keys(stats.outlets_by_property_type).length > 0) {
          if (!cancelled) setPropertyTypeCounts(stats.outlets_by_property_type);
          return;
        }
        // Otherwise fetch outlets and compute
        const data = await listOutlets({ page: 1, page_size: 500 });
        if (!cancelled && data?.items) {
          const counts: Record<string, number> = {};
          for (const outlet of data.items) {
            const pt = (outlet as { property_type?: string }).property_type || "unknown";
            counts[pt] = (counts[pt] || 0) + 1;
          }
          setPropertyTypeCounts(counts);
        }
      } catch {
        // Non-critical — silently ignore
      }
    }

    if (stats) fetchPropertyTypes();
    return () => { cancelled = true; };
  }, [stats]);

  // Fetch payments due this week
  useEffect(() => {
    let cancelled = false;

    async function fetchDueThisWeek() {
      try {
        const now = new Date();
        const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const dueFrom = now.toISOString().split("T")[0];
        const dueTo = end.toISOString().split("T")[0];

        const data = await listPayments({
          due_from: dueFrom,
          due_to: dueTo,
          page: 1,
          page_size: 50,
        });

        if (!cancelled && data?.items) {
          // Filter out already paid
          const unpaid = data.items.filter(
            (p: { status?: string }) => p.status !== "paid"
          );
          const totalAmount = unpaid.reduce(
            (sum: number, p: { due_amount?: number; amount?: number }) => sum + (p.due_amount || p.amount || 0),
            0
          );
          setDueThisWeek({
            items: unpaid.map((p: {
              id: string;
              outlet_name?: string;
              outlets?: { name?: string };
              type?: string;
              obligation_type?: string;
              obligations?: { type?: string };
              due_amount?: number;
              amount?: number;
              due_date?: string;
            }) => ({
              id: p.id,
              outlet_name: p.outlet_name || p.outlets?.name || "Unknown",
              type: p.type || p.obligations?.type || p.obligation_type || "payment",
              amount: p.due_amount || p.amount || 0,
              due_date: p.due_date || "",
            })),
            total: unpaid.length,
            totalAmount,
          });
        }
      } catch {
        // Non-critical
      }
    }

    async function fetchUpcomingEvents() {
      try {
        const data = await listUpcomingEvents(30);
        if (!cancelled && data?.events) {
          setUpcomingEvents(data.events.slice(0, 5));
        }
      } catch {
        // Non-critical
      }
    }

    if (stats) {
      fetchDueThisWeek();
      fetchUpcomingEvents();
    }
    return () => { cancelled = true; };
  }, [stats]);

  // Fetch health score and onboarding data
  useEffect(() => {
    let cancelled = false;

    async function fetchHealthAndOnboarding() {
      try {
        const agrData = await listAgreements({ page: 1, page_size: 200 });
        if (cancelled) return;

        const agreements = agrData?.items || [];
        const totalAgreements = agreements.length;

        // Calculate average health score from agreements with health_score in extracted_data
        const scores: number[] = [];
        let hasConfirmed = false;
        for (const agr of agreements) {
          if (agr.extraction_status === "confirmed") hasConfirmed = true;
          const ed = agr.extracted_data;
          if (ed && typeof ed === "object") {
            // Check various places health_score might be
            const hs =
              (ed as Record<string, unknown>).health_score ||
              ((ed as Record<string, Record<string, unknown>>).lease_term || {}).health_score;
            if (typeof hs === "number") scores.push(hs);
            else if (typeof hs === "object" && hs && "value" in (hs as Record<string, unknown>)) {
              const val = (hs as Record<string, unknown>).value;
              if (typeof val === "number") scores.push(val);
            }
          }
        }

        if (!cancelled) {
          if (scores.length > 0) {
            setAvgHealthScore(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
          } else if (totalAgreements > 0) {
            // Agreements exist but the LLM didn't write a health_score.
            // Compute one from observable risk signals so the dashboard
            // reflects the real portfolio state instead of the 75
            // placeholder fallback.
            let computed = 100;
            for (const agr of agreements) {
              const risks = Array.isArray(agr.risk_flags) ? agr.risk_flags : [];
              for (const r of risks) {
                const sev = (r as { severity?: string })?.severity;
                computed -= sev === "high" ? 10 : sev === "medium" ? 5 : 2;
              }
              // Expiring within 90 days drags score down
              if (agr.lease_expiry_date) {
                const days = (new Date(agr.lease_expiry_date).getTime() - Date.now()) / 86400000;
                if (days > 0 && days < 90) computed -= 5;
                else if (days <= 0) computed -= 15;
              }
            }
            setAvgHealthScore(Math.max(0, Math.min(100, Math.round(computed / Math.max(1, totalAgreements)) * 1)));
          } else {
            // No agreements at all — leave as null so the UI shows the
            // "no data yet" empty state instead of a misleading 75.
            setAvgHealthScore(null);
          }

          // Get org member count for onboarding
          let memberCount = 1;
          try {
            if (user?.orgId) {
              const members = await getOrgMembers(user.orgId);
              memberCount = members?.members?.length || 1;
            }
          } catch {
            // ignore
          }

          setOnboardingData({
            totalAgreements,
            hasConfirmedExtraction: hasConfirmed,
            orgMemberCount: memberCount,
          });
        }
      } catch {
        // Non-critical
      }
    }

    if (stats && user) fetchHealthAndOnboarding();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, user?.orgId]);

  // Mark payment as paid handler
  async function handleMarkPaid(paymentId: string) {
    setMarkingPaid(paymentId);
    try {
      await updatePayment(paymentId, { status: "paid" });
      setDueThisWeek((prev) => {
        const remaining = prev.items.filter((i) => i.id !== paymentId);
        const paidItem = prev.items.find((i) => i.id === paymentId);
        return {
          items: remaining,
          total: remaining.length,
          totalAmount: prev.totalAmount - (paidItem?.amount || 0),
        };
      });
    } catch {
      // ignore
    } finally {
      setMarkingPaid(null);
    }
  }

  // Role-based visibility helpers
  // TODO: If role-scoped backend endpoints are added, filter data server-side as well
  const isPlatformAdmin = user?.role === "platform_admin" || user?.role === "org_admin";
  const isOrgMember = user?.role === "org_member";

  // Role tier badge config (Task 42)
  const roleTierConfig: Record<string, { badge: string; color: string; icon: JSX.Element }> = {
    platform_admin: {
      badge: "System Admin",
      color: "bg-foreground/10 text-foreground border-foreground/20",
      icon: <Shield className="h-3 w-3" />,
    },
    org_admin: {
      badge: "Admin",
      color: "bg-foreground/[0.08] text-foreground/80 border-foreground/[0.15]",
      icon: <Users className="h-3 w-3" />,
    },
    org_member: {
      badge: "Member",
      color: "bg-muted text-foreground border-border",
      icon: <User className="h-3 w-3" />,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _currentTier = roleTierConfig[user?.role || "org_member"];

  // Loading state
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Dashboard</h1>
        </div>
        <Card className="border-neutral-200">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertTriangle className="h-8 w-8 text-neutral-500 mb-3" />
            <p className="text-sm font-medium text-neutral-900 mb-1">
              Failed to load dashboard
            </p>
            <p className="text-xs text-muted-foreground mb-4">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Super Admin sees a completely different dashboard — the platform-wide
  // view of every organization, not one org's portfolio. Route them there
  // before anything else renders.
  if (user?.role === "platform_admin") {
    return <SuperAdminDashboard />;
  }

  // Empty state -- no outlets or agreements yet (for non-super-admin users)
  if (
    stats &&
    stats.total_outlets === 0 &&
    stats.total_agreements === 0
  ) {
    return <EmptyState />;
  }

  // Derive chart data
  const outletsByCity = stats
    ? Object.entries(stats.outlets_by_city)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
    : [];

  const outletsByStatus = stats
    ? Object.entries(stats.outlets_by_status).map(([status, count]) => ({
      status,
      count,
    }))
    : [];

  const maxCityCount = outletsByCity.length
    ? Math.max(...outletsByCity.map((c) => c.count))
    : 1;

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* Executive Overview — compact hero                             */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground leading-tight">
            Executive Overview
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Portfolio for <span className="text-foreground font-semibold">{new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canWrite(user?.role as UserRole | undefined) && (
            <Link href="/outlets?action=create">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Add Outlet
              </Button>
            </Link>
          )}
          <Link href="/ai-assistant">
            <Button size="sm" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" strokeWidth={2} />
              Ask Gro AI
            </Button>
          </Link>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* Onboarding Checklist (for new users)                          */}
      {/* ──────────────────────────────────────────────────────────── */}
      {onboardingData && (
        <OnboardingChecklist
          totalAgreements={onboardingData.totalAgreements}
          hasConfirmedExtraction={onboardingData.hasConfirmedExtraction}
          orgMemberCount={onboardingData.orgMemberCount}
        />
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* KPI grid — 5 metrics, monochrome, animated count-up           */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StaggerItem>
          <KpiCard
            label="Total Outlets"
            value={stats?.total_outlets ?? 0}
            format={(v) => String(Math.round(v)).padStart(2, "0")}
            icon={Store}
            href="/outlets"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Agreements"
            value={stats?.active_agreements ?? 0}
            format={(v) => String(Math.round(v)).padStart(2, "0")}
            sublabel={`${stats?.total_agreements ?? 0} total`}
            icon={FileCheck}
            href="/agreements"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Overdue"
            value={stats?.overdue_amount ?? 0}
            format={(v) => formatINR(v)}
            sublabel={`${stats?.overdue_payments_count ?? 0} payment${(stats?.overdue_payments_count ?? 0) !== 1 ? "s" : ""}`}
            icon={TrendingUp}
            href="/payments"
            trend={(stats?.overdue_amount ?? 0) > 0 ? "down" : "flat"}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            label="Pending Reminders"
            value={stats?.pending_alerts ?? 0}
            format={(v) => String(Math.round(v)).padStart(2, "0")}
            icon={Bell}
            href="/alerts"
            delta={(stats?.pending_alerts ?? 0) > 0 ? "Action needed" : undefined}
            trend={(stats?.pending_alerts ?? 0) > 0 ? "down" : "flat"}
          />
        </StaggerItem>
      </Stagger>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* ZONE 2 — Financials card (compact, cost ratio inline) + Lease Health (compact gauge)  */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">

        {/* ── Financials (3/5 cols) — compact card, ratio inline ── */}
        <section className="lg:col-span-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[14px] font-semibold text-foreground">This Month</h3>
              <span className="text-micro">Financials</span>
            </div>
            <Link href="/reports" className="text-[11px] font-semibold text-foreground hover:underline underline-offset-4">
              View report →
            </Link>
          </div>

          {/* Two metrics — inline, divider rules (Overdue lives in KPI row above) */}
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="pr-4">
              <p className="text-micro mb-1.5">Rental Yield</p>
              <p className="text-[24px] font-semibold text-foreground tabular-nums leading-none">
                <Counter value={stats?.total_monthly_rent ?? 0} format={(v) => formatINR(v)} />
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {stats?.total_monthly_rent && stats.total_monthly_rent > 0 ? "Active income" : "No active rent"}
              </p>
            </div>

            <div className="pl-4">
              <p className="text-micro mb-1.5">Total Outflow</p>
              <p className="text-[24px] font-semibold text-foreground tabular-nums leading-none">
                <Counter value={stats?.total_monthly_outflow ?? 0} format={(v) => formatINR(v)} />
              </p>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Rent + CAM + other charges
              </p>
            </div>
          </div>

          {/* Cost ratio — compact inline strip */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-micro">Rent-to-Outflow Ratio</span>
              <span className="text-[11px] font-semibold text-foreground tabular-nums">
                {stats?.total_monthly_outflow && stats.total_monthly_rent
                  ? `${Math.round((stats.total_monthly_rent / stats.total_monthly_outflow) * 100)}% Rent · ${100 - Math.round((stats.total_monthly_rent / stats.total_monthly_outflow) * 100)}% Other`
                  : "—"}
              </span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden flex">
              {stats?.total_monthly_outflow && stats.total_monthly_rent ? (
                <>
                  <div
                    className="h-full bg-foreground transition-all duration-700"
                    style={{ width: `${Math.min(100, (stats.total_monthly_rent / stats.total_monthly_outflow) * 100)}%` }}
                  />
                  <div className="h-full bg-foreground/20 flex-1" />
                </>
              ) : (
                <div className="h-full bg-muted-foreground/20 w-full" />
              )}
            </div>
          </div>
        </section>

        {/* ── Lease Health (2/5 cols) — compact gauge + inline stats ── */}
        <section className="lg:col-span-2 rounded-xl border border-border bg-card elevation-1 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[14px] font-semibold text-foreground">Lease Health</h3>
              <span className="text-micro">Score</span>
            </div>
            <Link href="/alerts" className="text-[11px] font-semibold text-foreground hover:underline underline-offset-4">
              Review
            </Link>
          </div>

          <div className="flex-1 flex items-center gap-4">
            {/* Compact gauge — shows real score if we have agreements,
                "—" placeholder + CTA when the portfolio is empty. No more
                misleading 75 fallback. */}
            <div className="relative w-[104px] h-[104px] shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
                {avgHealthScore !== null && (
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke={
                      avgHealthScore >= 70 ? "hsl(var(--success))"
                      : avgHealthScore >= 40 ? "hsl(var(--warning))"
                      : "hsl(var(--destructive))"
                    }
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${avgHealthScore * 2.64} 264`}
                    className="transition-all duration-1000 ease-out"
                  />
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {avgHealthScore !== null ? (
                  <>
                    <span className="text-[28px] font-semibold tracking-tight text-foreground leading-none tabular-nums">
                      <Counter value={avgHealthScore} />
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">/ 100</span>
                  </>
                ) : (
                  <>
                    <span className="text-[28px] font-semibold tracking-tight text-muted-foreground/40 leading-none tabular-nums">—</span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">No data</span>
                  </>
                )}
              </div>
            </div>

            {/* Inline stats — vertical list, not grid */}
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-muted-foreground">Risks</span>
                <span className="text-[14px] font-semibold tabular-nums text-foreground">{stats?.total_risk_flags ?? 0}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-muted-foreground">Expiring</span>
                <span className="text-[14px] font-semibold tabular-nums text-foreground">{stats?.expiring_leases_90d ?? 0}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-muted-foreground">Active</span>
                <span className="text-[14px] font-semibold tabular-nums text-foreground">{stats?.active_agreements ?? 0}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* ZONE 3 — Upcoming Events (compact card with row list)         */}
      {/* ──────────────────────────────────────────────────────────── */}
      {upcomingEvents.length > 0 && (
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[14px] font-semibold text-foreground">Upcoming Events</h3>
              <span className="text-micro">Next 30 days</span>
            </div>
            <Link href="/alerts" className="text-[11px] font-semibold text-foreground hover:underline underline-offset-4">
              View all →
            </Link>
          </div>

          <ul className="divide-y divide-border">
            {upcomingEvents.slice(0, 5).map((evt) => {
              const dateStr = evt.date_value as string;
              const d = dateStr ? new Date(dateStr) : null;
              const priority = evt.priority as string;
              const tone =
                priority === "critical" ? "bg-destructive" :
                priority === "high" ? "bg-warning" :
                "bg-foreground/30";
              return (
                <li
                  key={evt.id as string}
                  className="flex items-center gap-4 px-4 py-2.5 transition-colors duration-fast hover:bg-muted/50 cursor-pointer"
                >
                  <div className="flex items-baseline gap-1.5 w-16 shrink-0 tabular-nums">
                    <span className="text-[16px] font-semibold text-foreground leading-none">
                      {d ? d.getDate() : "?"}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {d ? d.toLocaleDateString("en-IN", { month: "short" }) : "—"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate leading-tight">{evt.label as string}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {evt.outlets ? (evt.outlets as Record<string, string>).name : "General portfolio event"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn("w-1.5 h-1.5 rounded-full", tone)} />
                    <span className="text-[10px] font-medium text-muted-foreground capitalize">
                      {priority || "normal"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Due This Week + Portfolio Health                             */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
        {/* Due This Week Widget */}
        <Card className={cn("rounded-2xl border-border/10", dueThisWeek.total > 0 ? "bg-card shadow-card" : "bg-muted/30")}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-muted">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Due This Week</h3>
                  {dueThisWeek.total > 0 && (
                    <p className="text-[11px] text-amber-600 font-semibold uppercase tracking-wider">{dueThisWeek.total} Payments Pending</p>
                  )}
                </div>
              </div>
              <Link href="/payments">
                <Button variant="ghost" size="sm" className="text-xs font-semibold text-muted-foreground hover:text-primary">
                  View All
                </Button>
              </Link>
            </div>

            {dueThisWeek.total === 0 ? (
              <div className="flex items-center gap-3 py-4 px-4 rounded-2xl bg-emerald-50/50 border border-emerald-100/50">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <span className="text-[13px] text-emerald-900 font-medium">All payments for this week are cleared</span>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[13px] text-muted-foreground font-medium">
                  Totaling <span className="font-semibold text-foreground">{formatINR(dueThisWeek.totalAmount)}</span>
                </p>

                {/* Mini week calendar */}
                <div className="grid grid-cols-7 gap-1.5">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    const dateStr = d.toISOString().split("T")[0];
                    const count = dueThisWeek.items.filter(item => item.due_date?.startsWith(dateStr)).length;
                    return (
                      <div key={i} className={cn(
                        "rounded-xl py-2 flex flex-col items-center transition-all",
                        count > 0 ? "bg-amber-100 border border-amber-200" : "bg-muted/50 border border-transparent"
                      )}>
                        <div className="text-[9px] font-semibold uppercase tracking-tight text-muted-foreground opacity-70">{d.toLocaleDateString("en-IN", { weekday: "short" })}</div>
                        <div className="text-[13px] font-semibold mt-0.5">{d.getDate()}</div>
                        {count > 0 && <div className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-600" />}
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {dueThisWeek.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl bg-muted/30 border border-border/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate">{item.outlet_name}</p>
                        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
                          {item.type.replace(/_/g, " ")} &middot; {item.due_date ? new Date(item.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "--"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[13px] font-semibold text-foreground tabular-nums">{formatINR(item.amount)}</p>
                        <button
                          disabled={markingPaid === item.id}
                          onClick={() => handleMarkPaid(item.id)}
                          className="text-[10px] font-semibold text-primary hover:underline mt-0.5 disabled:opacity-50"
                        >
                          {markingPaid === item.id ? "Processing..." : "Mark Paid"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Health / Snapshot */}
        {avgHealthScore !== null ? (
          <Card className="rounded-2xl border-border/10 bg-card shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <HealthScoreGauge score={avgHealthScore} size="md" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-semibold">{avgHealthScore}</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Portfolio Health</h3>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    Based on {stats?.total_agreements ?? 0} active agreements
                  </p>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-2xl border flex items-start gap-3",
                avgHealthScore >= 70 ? "bg-emerald-50/50 border-emerald-100/50" : "bg-amber-50/50 border-amber-100/50"
              )}>
                <Heart className={cn("h-4 w-4 shrink-0 mt-0.5", avgHealthScore >= 70 ? "text-emerald-500" : "text-amber-500")} />
                <p className={cn("text-[13px] font-medium leading-relaxed", avgHealthScore >= 70 ? "text-emerald-900" : "text-amber-900")}>
                  {avgHealthScore >= 70
                    ? "Your portfolio is in excellent shape. No major renewal or compliance risks detected."
                    : avgHealthScore >= 40
                      ? "A few agreements require immediate attention to maintain compliance metrics."
                      : "Multiple high-risk flags identified. Urgent review of portfolio is recommended."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="bg-white p-6 rounded-2xl shadow-card border border-border/10">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground mb-6">Portfolio Snapshot</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Risk Flags */}
              <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100">
                <ShieldAlert className="h-5 w-5 text-destructive mb-2" strokeWidth={2} />
                <p className="text-[26px] font-semibold text-destructive tracking-tight leading-none">
                  {String(stats?.total_risk_flags ?? 0).padStart(2, "0")}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 mt-1">Risk Flags</p>
              </div>
              {/* Expiring */}
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100">
                <CalendarClock className="h-5 w-5 text-amber-600 mb-2" strokeWidth={2} />
                <p className="text-[26px] font-semibold text-amber-700 tracking-tight leading-none">
                  {String(stats?.expiring_leases_90d ?? 0).padStart(2, "0")}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mt-1">Expiring</p>
              </div>
              {/* Pending Alerts */}
              <div className="p-4 rounded-2xl bg-accent/60 border border-accent">
                <Bell className="h-5 w-5 text-primary mb-2" strokeWidth={2} />
                <p className="text-[26px] font-semibold text-primary tracking-tight leading-none">
                  {String(stats?.pending_alerts ?? 0).padStart(2, "0")}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mt-1">Pending Alerts</p>
              </div>
              {/* Overdue */}
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                <IndianRupee className="h-5 w-5 text-emerald-700 mb-2" strokeWidth={2} />
                <p className="text-[26px] font-semibold text-emerald-700 tracking-tight leading-none">
                  {String(stats?.overdue_payments_count ?? 0).padStart(2, "0")}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mt-1">Overdue</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Portfolio Breakdown — Revenue / Area / Brand                      */}
      {/* -------------------------------------------------------------- */}
      {
        isPlatformAdmin && stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Revenue vs Rent */}
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Monthly Financials</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Rent</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(stats.total_monthly_rent || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Outflow</span>
                    <span className="text-sm font-semibold tabular-nums text-rose-700">
                      {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(stats.total_monthly_outflow || 0)}
                    </span>
                  </div>
                  {(stats.overdue_amount ?? 0) > 0 && (
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-xs text-rose-600">Overdue</span>
                      <span className="text-sm font-semibold tabular-nums text-rose-600">
                        {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(stats.overdue_amount || 0)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Area Under Management */}
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Portfolio Area</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total Outlets</span>
                    <span className="text-sm font-semibold tabular-nums">{stats.total_outlets || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Active Agreements</span>
                    <span className="text-sm font-semibold tabular-nums">{stats.active_agreements || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Avg Rent / Outlet</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {stats.total_outlets > 0
                        ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format((stats.total_monthly_rent || 0) / stats.total_outlets)
                        : "--"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Brand / City Distribution */}
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Distribution</p>
                <div className="space-y-1.5">
                  {stats.outlets_by_city && Object.entries(stats.outlets_by_city).slice(0, 3).map(([city, count]) => (
                    <div key={city} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate">{city}</span>
                      <span className="text-sm font-semibold tabular-nums">{count as number}</span>
                    </div>
                  ))}
                  {stats.outlets_by_city && Object.keys(stats.outlets_by_city).length > 3 && (
                    <p className="text-[10px] text-muted-foreground">+{Object.keys(stats.outlets_by_city).length - 3} more cities</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )
      }

      {/* -------------------------------------------------------------- */}
      {/* Quick Actions Row                                                */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Common actions for all roles */}
        <Link href="/outlets?action=create">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
            Add Outlet
          </Button>
        </Link>
        <Link href="/agreements/upload">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            Upload Documents
          </Button>
        </Link>
        <Link href="/ai-assistant">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            Gro AI
          </Button>
        </Link>
        <Link href="/outlets">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Store className="h-3.5 w-3.5" />
            View All Outlets
          </Button>
        </Link>
        <Link href="/payments">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Wallet className="h-3.5 w-3.5" />
            Payments
          </Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <BarChart3 className="h-3.5 w-3.5" />
            View Reports
          </Button>
        </Link>

        {/* platform_admin has its own dashboard at SuperAdminDashboard —
            we never reach this code path for them. */}

        {/* org_admin: team management shortcuts */}
        {user?.role === "org_admin" && (
          <Link href="/settings">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
              <Users className="h-3.5 w-3.5" />
              Manage Team
            </Button>
          </Link>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Map Teaser -- links to dedicated Map View page                     */}
      {/* -------------------------------------------------------------- */}
      {
        isPlatformAdmin && outletsByCity.length > 0 && (
          <Link href="/map" className="w-full group block">
            <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card hover:border-foreground/20 hover:shadow-sm transition-all duration-200 cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
                  <Map className="h-4 w-4 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-foreground">Outlet Map</p>
                  <p className="text-[10px] text-muted-foreground">
                    {outletsByCity.length} {outletsByCity.length === 1 ? "city" : "cities"} &middot; Open interactive map
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground transition-colors">
                <span className="text-[10px] font-medium hidden sm:inline">View map</span>
                <ExternalLink className="h-4 w-4" />
              </div>
            </div>
          </Link>
        )
      }

      {/* -------------------------------------------------------------- */}
      {/* Action alerts — only show if there are urgent items              */}
      {/* -------------------------------------------------------------- */}
      {
        ((stats?.overdue_payments_count ?? 0) > 0) && (
          <Link href="/payments">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100/50 transition-colors cursor-pointer">
              <IndianRupee className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <span className="text-sm text-rose-700">
                <span className="font-semibold">{stats?.overdue_payments_count ?? 0}</span> overdue payment{(stats?.overdue_payments_count ?? 0) !== 1 ? "s" : ""} ({formatINR(stats?.overdue_amount ?? 0)})
              </span>
            </div>
          </Link>
        )
      }

      {/* -------------------------------------------------------------- */}
      {/* Row 2.8 -- Expiring Leases + Risk Flags + Property Type cards    */}
      {/* -------------------------------------------------------------- */}
      {
        isPlatformAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
            {/* Expiring Leases Card */}
            <Card className="border-amber-200/60 bg-amber-50/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                <CardTitle className="text-xs font-medium text-amber-700">
                  Expiring Leases
                </CardTitle>
                <CalendarClock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-semibold font-mono tracking-tight text-amber-700">
                  {stats?.expiring_leases_90d ?? 0}
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  Agreements expiring within 90 days
                </p>
                {(stats?.expiring_leases_90d ?? 0) > 0 && (
                  <Link href="/alerts" className="inline-block mt-2">
                    <Button variant="outline" size="sm" className="text-[11px] h-7 border-amber-300 text-amber-700 hover:bg-amber-100">
                      Review Expiring
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Expiring Licenses Card */}
            <Card className="border-amber-200/60 bg-amber-50/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                <CardTitle className="text-xs font-medium text-amber-700">
                  Expiring Licenses
                </CardTitle>
                <FileCheck className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-semibold font-mono tracking-tight text-amber-700">
                  {(stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_30d ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {stats?.expiring_licenses_30d ?? 0} &lt;30d
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_60d ?? 0) > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {stats?.expiring_licenses_60d ?? 0} 30-60d
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_90d ?? 0) > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {stats?.expiring_licenses_90d ?? 0} 60-90d
                  </span>
                </div>
                {((stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)) > 0 && (
                  <Link href="/agreements" className="inline-block mt-2">
                    <Button variant="outline" size="sm" className="text-[11px] h-7 border-amber-300 text-amber-700 hover:bg-amber-100">
                      Review Licenses
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Risk Flags Summary Card */}
            <Card className={`${(stats?.total_risk_flags ?? 0) > 0 ? "border-rose-200/60 bg-rose-50/30" : "border-emerald-200/60 bg-emerald-50/30"}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                <CardTitle className={`text-xs font-medium ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  Risk Flags Summary
                </CardTitle>
                <ShieldAlert className={`h-4 w-4 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`} />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className={`text-2xl font-semibold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {stats?.total_risk_flags ?? 0}
                </div>
                <p className={`text-xs mt-1 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {(stats?.total_risk_flags ?? 0) > 0
                    ? "Total risk flags across all agreements"
                    : "No risk flags — portfolio looks healthy"}
                </p>
                {(stats?.total_risk_flags ?? 0) > 0 && (
                  <Link href="/agreements" className="inline-block mt-2">
                    <Button variant="outline" size="sm" className="text-[11px] h-7 border-rose-200 text-rose-700 hover:bg-rose-100">
                      View Flagged
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            {/* Outlets by Property Type Card */}
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold">Outlets by Property Type</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                {Object.keys(propertyTypeCounts).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No property type data yet.</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(propertyTypeCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([type, count]) => {
                        const maxCount = Math.max(...Object.values(propertyTypeCounts));
                        return (
                          <div key={type}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: propertyTypeColor(type) }}
                                />
                                <span className="text-xs text-foreground">{statusLabel(type)}</span>
                              </div>
                              <span className="text-xs font-semibold tabular-nums">{count}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(count / maxCount) * 100}%`,
                                  backgroundColor: propertyTypeColor(type),
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )
      }

      {/* -------------------------------------------------------------- */}
      {/* Pipeline Summary [admin only] — moved lower per review feedback  */}
      {/* -------------------------------------------------------------- */}
      {
        isPlatformAdmin && stats?.pipeline_stages && Object.keys(stats.pipeline_stages).length > 0 && (
          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Lead Pipeline</CardTitle>
                <Link href="/pipeline">
                  <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-muted">
                    View Pipeline
                  </Badge>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex divide-x divide-border/40 overflow-x-auto">
                {["lead", "site_visit", "negotiation", "loi", "agreement", "fitout", "operational", "won", "closed", "abandoned"].map((stage) => {
                  const count = stats.pipeline_stages?.[stage] ?? 0;
                  return (
                    <div key={stage} className="flex-1 flex flex-col items-center py-4 px-5 min-w-[90px]">
                      <span className="text-lg font-semibold font-mono tracking-tight">{count}</span>
                      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground text-center mt-0.5">{statusLabel(stage)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )
      }

      {/* -------------------------------------------------------------- */}
      {/* Row 3 -- Outlets by City & Status [admin only]                    */}
      {/* -------------------------------------------------------------- */}
      {
        isPlatformAdmin && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {/* Outlets by City */}
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-foreground flex items-center justify-center">
                  <MapPin className="h-3 w-3 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold">
                  Outlets by City
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] ml-auto font-semibold">
                  {outletsByCity.reduce((s, c) => s + c.count, 0)} total
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {outletsByCity.length === 0 ? (
                <p className="text-xs text-muted-foreground">No outlet data yet.</p>
              ) : (
                <div className="space-y-3">
                  {outletsByCity.map(({ city, count }) => {
                    const pct = (count / maxCityCount) * 100;
                    return (
                      <div key={city} className="group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground group-hover:text-foreground transition-colors">{city}</span>
                          <span className="text-xs font-semibold text-foreground tabular-nums">{count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-foreground transition-all duration-700 ease-out"
                            style={{ width: `${pct}%`, opacity: 0.15 + (pct / 100) * 0.85 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outlets by Status -- Modern Cards */}
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-foreground flex items-center justify-center">
                  <Activity className="h-3 w-3 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold">
                  Outlets by Status
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {outletsByStatus.length === 0 ? (
                <p className="text-xs text-muted-foreground">No outlet data yet.</p>
              ) : (
                <div className="space-y-2">
                  {outletsByStatus
                    .sort((a, b) => b.count - a.count)
                    .map(({ status, count }) => {
                      const total = outletsByStatus.reduce((s, c) => s + c.count, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      const color = statusColor(status);
                      return (
                        <div key={status} className="group flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted transition-all duration-200">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                          >
                            <span className="text-sm font-semibold" style={{ color }}>{count}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-foreground">{statusLabel(status)}</span>
                              <span className="text-[10px] font-semibold text-muted-foreground">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${pct}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rent by City */}
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-foreground flex items-center justify-center">
                  <IndianRupee className="h-3 w-3 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold">
                  Rent by City
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] ml-auto font-semibold">
                  {formatINR(stats?.total_monthly_rent ?? 0)}/mo
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {outletsByCity.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rent data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {outletsByCity.map(({ city }) => {
                    const cityOutlets = stats?.outlet_details_by_city?.[city] || [];
                    const cityRent = cityOutlets.reduce((s, o) => s + (o.rent ?? 0), 0);
                    if (cityRent === 0) return null;
                    const totalRent = stats?.total_monthly_rent || 1;
                    const pct = Math.round((cityRent / totalRent) * 100);
                    return (
                      <div key={city}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-foreground">{city}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{pct}%</span>
                            <span className="text-xs font-semibold text-foreground tabular-nums">{formatINR(cityRent)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
                            style={{ width: `${pct}%`, opacity: 0.3 + (pct / 100) * 0.7 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {/* Avg rent per outlet */}
                  {(stats?.total_outlets ?? 0) > 0 && (
                    <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Avg rent per outlet</span>
                      <span className="text-xs font-semibold text-foreground tabular-nums">
                        {formatINR((stats?.total_monthly_rent ?? 0) / (stats?.total_outlets ?? 1))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      }

      {/* -------------------------------------------------------------- */}
      {/* Org Member Simplified View                                       */}
      {/* -------------------------------------------------------------- */}
      {
        isOrgMember && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 lg:gap-6">
            {/* Expiring Leases Card (org_member view) */}
            <Card className="border-amber-200/60 bg-amber-50/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                <CardTitle className="text-xs font-medium text-amber-700">
                  Expiring Leases
                </CardTitle>
                <CalendarClock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-semibold font-mono tracking-tight text-amber-700">
                  {stats?.expiring_leases_90d ?? 0}
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  Agreements expiring within 90 days
                </p>
              </CardContent>
            </Card>

            {/* Expiring Licenses Card (org_member view) */}
            <Card className="border-amber-200/60 bg-amber-50/30">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                <CardTitle className="text-xs font-medium text-amber-700">
                  Expiring Licenses
                </CardTitle>
                <FileCheck className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-semibold font-mono tracking-tight text-amber-700">
                  {(stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_30d ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {stats?.expiring_licenses_30d ?? 0} &lt;30d
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_60d ?? 0) > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {stats?.expiring_licenses_60d ?? 0} 30-60d
                  </span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_90d ?? 0) > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {stats?.expiring_licenses_90d ?? 0} 60-90d
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Risk Flags (org_member view) */}
            <Card className={`${(stats?.total_risk_flags ?? 0) > 0 ? "border-rose-200/60 bg-rose-50/30" : "border-emerald-200/60 bg-emerald-50/30"}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                <CardTitle className={`text-xs font-medium ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  Risk Flags
                </CardTitle>
                <ShieldAlert className={`h-4 w-4 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`} />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className={`text-2xl font-semibold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {stats?.total_risk_flags ?? 0}
                </div>
                <p className={`text-xs mt-1 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {(stats?.total_risk_flags ?? 0) > 0
                    ? "Flags needing your attention"
                    : "All clear — no risk flags"}
                </p>
              </CardContent>
            </Card>
          </div>
        )
      }

      {/* -------------------------------------------------------------- */}
      {/* Row 5 -- Gro AI Chat                                       */}
      {/* -------------------------------------------------------------- */}
      <SmartAIChat />
    </div >
  );
}


// -------------------------------------------------------------------
// Super Admin Dashboard
// -------------------------------------------------------------------
// Completely different from the org-scoped Executive Overview. Shows
// platform-wide stats: how many orgs exist, per-org drill-in cards,
// and quick access to create a new org or jump into Settings.

interface SuperAdminOrgRow {
  id: string;
  name: string;
  created_at?: string;
  default_admin_email?: string | null;
  sheet_tab_name?: string | null;
  business_type?: string | null;
  expected_outlets_size?: string | null;
  hq_city?: string | null;
}

function SuperAdminDashboard() {
  const [orgs, setOrgs] = useState<SuperAdminOrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await listOrganizations();
        setOrgs((data.items || data.organizations || []) as SuperAdminOrgRow[]);
      } catch (err) {
        console.error("Failed to load orgs", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return orgs;
    const q = query.toLowerCase();
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.default_admin_email?.toLowerCase().includes(q) ||
        o.business_type?.toLowerCase().includes(q) ||
        o.hq_city?.toLowerCase().includes(q),
    );
  }, [orgs, query]);

  const totalOrgs = orgs.length;
  const newThisMonth = orgs.filter((o) => {
    if (!o.created_at) return false;
    const d = new Date(o.created_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground leading-tight flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Platform Overview
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Super Admin view · {totalOrgs} customer organization{totalOrgs === 1 ? "" : "s"} · {newThisMonth} new this month
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/settings">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" strokeWidth={2} />
              Platform Settings
            </Button>
          </Link>
          <Link href="/settings?tab=platform">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Create New Organization
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Total Organizations</p>
            <p className="text-[28px] font-semibold tabular-nums leading-none mt-1">{totalOrgs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">New This Month</p>
            <p className="text-[28px] font-semibold tabular-nums leading-none mt-1">{newThisMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">With Admin Assigned</p>
            <p className="text-[28px] font-semibold tabular-nums leading-none mt-1">
              {orgs.filter((o) => o.default_admin_email).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Unassigned</p>
            <p className="text-[28px] font-semibold tabular-nums leading-none mt-1 text-amber-600">
              {orgs.filter((o) => !o.default_admin_email).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search organizations by name, admin, city, or type…"
          className="pl-3"
        />
      </div>

      {/* Orgs list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading organizations…</span>
        </div>
      ) : totalOrgs === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No organizations yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
              You haven&apos;t onboarded any customers yet. Create the first
              organization to start seeding the platform.
            </p>
            <Link href="/settings?tab=platform">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Create First Organization
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((o) => (
            <Link key={o.id} href={`/organizations/${o.id}`} className="group">
              <Card className="h-full hover:border-foreground/20 transition-colors cursor-pointer">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0 font-semibold">
                      {o.name[0]?.toUpperCase() || "O"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold truncate group-hover:underline">{o.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {o.business_type ? o.business_type.replace(/_/g, " ") : "—"}
                        {o.hq_city ? ` · ${o.hq_city}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Admin</span>
                      <span className="font-mono text-foreground/80 truncate max-w-[170px]">
                        {o.default_admin_email || (
                          <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[9.5px]">Unassigned</Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Size</span>
                      <span className="text-foreground/80">{o.expected_outlets_size || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span className="text-foreground/80">
                        {o.created_at ? new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
