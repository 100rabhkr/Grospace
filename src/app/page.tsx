"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getDashboardStats, smartChat, listOutlets, listPayments, updatePayment, listAgreements, getOrgMembers, logUsage } from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import { HealthScoreGauge } from "@/components/health-score-gauge";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Store,
  FileCheck,
  IndianRupee,
  Bell,
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
  ChevronUp,
  Map,
  TrendingUp,
  FileText,
  Lightbulb,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Heart,
} from "lucide-react";

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <SkeletonBlock className="h-7 w-16 mb-1.5" />
        <SkeletonBlock className="h-2.5 w-28" />
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
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Welcome to GroSpace
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Rocket className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Get Started with GroSpace</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Upload your first document to start tracking outlets,
            events, and reminders across your portfolio.
          </p>
          <div className="flex gap-3">
            <Link href="/agreements/upload">
              <Button size="sm">
                <Upload className="h-4 w-4" />
                Upload Documents
              </Button>
            </Link>
            <Link href="/outlets">
              <Button variant="outline" size="sm">
                <Store className="h-4 w-4" />
                View Outlets
              </Button>
            </Link>
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
    <Card>
      <CardHeader
        className="p-4 pb-2 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-foreground" />
            <CardTitle className="text-sm font-semibold">Gro AI</CardTitle>
            <Badge variant="outline" className="text-[10px]">AI</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ai-assistant"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              Full view <ExternalLink className="w-3 h-3" />
            </Link>
            <Badge variant="outline" className="text-[10px]">
              {isOpen ? "Collapse" : "Expand"}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ask anything about your portfolio — escalation, risk, payments, expiry
        </p>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 pt-2">
          {/* Chat Messages */}
          <div className="border border-border rounded-lg bg-muted/50 h-[300px] overflow-y-auto p-3 mb-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Ask your portfolio a question</p>
                  <p className="text-xs text-muted-foreground mt-1">Pick a category or type your own question</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "ai" && (
                  <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-foreground text-white"
                      : "bg-card border border-border text-foreground"
                  }`}
                >
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div>{formatAIContent(msg.content)}</div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-border flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-foreground" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-card border border-border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Analyzing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Categorized Suggestions (when no messages) */}
          {messages.length === 0 && (
            <div className="mb-3">
              {/* Category tabs */}
              <div className="flex gap-1 mb-2">
                {suggestionCategories.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.label;
                  return (
                    <button
                      key={cat.label}
                      onClick={() => setActiveCategory(isActive ? null : cat.label)}
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        isActive
                          ? "bg-foreground text-white border-foreground"
                          : "bg-card border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
              {/* Questions for active category */}
              {activeCategory && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestionCategories
                    .find((c) => c.label === activeCategory)
                    ?.questions.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSend(q)}
                        disabled={loading}
                        className="text-xs bg-card border border-border rounded-full px-3 py-1.5 text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                </div>
              )}
              {/* Show all when no category selected */}
              {!activeCategory && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestionCategories.flatMap((c) => c.questions.slice(0, 1)).map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      disabled={loading}
                      className="text-xs bg-card border border-border rounded-full px-3 py-1.5 text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Follow-up suggestions (when conversation active) */}
          {messages.length > 0 && !loading && (
            <div className="flex gap-1.5 mb-3 overflow-x-auto">
              {followUpSuggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1 whitespace-nowrap transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
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
              className="flex-1 text-sm"
              disabled={loading}
            />
            <Button
              size="sm"
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="px-3"
            >
              <Send className="h-4 w-4" />
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

  // Due This Week state
  const [dueThisWeek, setDueThisWeek] = useState<{
    items: { id: string; outlet_name: string; type: string; amount: number; due_date: string }[];
    total: number;
    totalAmount: number;
  }>({ items: [], total: 0, totalAmount: 0 });
  const [dueExpanded, setDueExpanded] = useState(false);
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
            (sum: number, p: { amount?: number }) => sum + (p.amount || 0),
            0
          );
          setDueThisWeek({
            items: unpaid.map((p: {
              id: string;
              outlet_name?: string;
              outlets?: { name?: string };
              type?: string;
              obligation_type?: string;
              amount?: number;
              due_date?: string;
            }) => ({
              id: p.id,
              outlet_name: p.outlet_name || p.outlets?.name || "Unknown",
              type: p.type || p.obligation_type || "payment",
              amount: p.amount || 0,
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

    if (stats) fetchDueThisWeek();
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
  const currentTier = roleTierConfig[user?.role || "org_member"];

  // Loading state
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
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

  // Empty state -- no outlets or agreements yet
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
    <div className="space-y-8 animate-fade-in max-w-[1400px] mx-auto">
      {/* -------------------------------------------------------------- */}
      {/* Page heading                                                     */}
      {/* -------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
            <Badge className={`text-[10px] gap-1 px-2 py-0.5 border ${currentTier.color}`}>
              {currentTier.icon}
              {currentTier.badge}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {user?.role === "platform_admin"
              ? `System-wide overview across ${stats?.total_outlets ?? 0} outlets and ${stats?.total_agreements ?? 0} agreements`
              : isPlatformAdmin
                ? `Organization overview — ${stats?.total_outlets ?? 0} outlets, ${stats?.total_agreements ?? 0} agreements`
                : `Your portfolio — ${stats?.total_outlets ?? 0} outlets, ${stats?.pending_alerts ?? 0} pending reminders`}
          </p>
        </div>
        {user?.role === "platform_admin" && (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="gap-1 text-[10px] text-emerald-700 border-emerald-200/60 bg-emerald-50">
              <Activity className="h-3 w-3" />
              System Healthy
            </Badge>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Onboarding Checklist (for new users)                             */}
      {/* -------------------------------------------------------------- */}
      {onboardingData && (
        <OnboardingChecklist
          totalAgreements={onboardingData.totalAgreements}
          hasConfirmedExtraction={onboardingData.hasConfirmedExtraction}
          orgMemberCount={onboardingData.orgMemberCount}
        />
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 1 -- Primary stat cards (4 columns)                          */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
        {/* Total Outlets */}
        <Link href="/outlets" className="cursor-pointer">
          <Card className="hover:border-foreground/20 hover:shadow-sm transition-all duration-200 cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Total Outlets
              </CardTitle>
              <Store className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-semibold font-mono tracking-tighter">
                {stats?.total_outlets ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Across all locations
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Active Agreements */}
        <Link href="/agreements" className="cursor-pointer">
          <Card className="hover:border-foreground/20 hover:shadow-sm transition-all duration-200 cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Active Agreements
              </CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xl font-semibold font-mono tracking-tighter">
                {stats?.active_agreements ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                of {stats?.total_agreements ?? 0} total
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Monthly Rent Exposure -- prominent */}
        <Link href="/payments" className="cursor-pointer">
          <Card className="border-neutral-800 bg-white hover:border-neutral-900 hover:shadow-sm transition-all duration-200 cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-neutral-900">
                Monthly Rent Exposure
              </CardTitle>
              <IndianRupee className="h-4 w-4 text-neutral-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold text-blue-600">
                {formatINR(stats?.total_monthly_rent ?? 0)}
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Total monthly rent
              </p>
            </CardContent>
          </Card>
        </Link>

        {/* Pending Reminders */}
        <Link href="/alerts" className="cursor-pointer">
          <Card className="hover:border-foreground/20 hover:shadow-sm transition-all duration-200 cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Pending Reminders
              </CardTitle>
              <Bell className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={`text-xl font-semibold ${(stats?.pending_alerts ?? 0) > 0 ? "text-amber-600" : ""}`}>
                {stats?.pending_alerts ?? 0}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Require attention
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Due This Week + Portfolio Health (prominent, right after stats)   */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6">
        {/* Due This Week Widget */}
        <Card className={dueThisWeek.total > 0 ? "border-neutral-200 bg-white" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-neutral-500" />
                <h3 className="text-sm font-semibold text-foreground">Due This Week</h3>
                {dueThisWeek.total > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-neutral-50 text-neutral-900 border-neutral-200">
                    {dueThisWeek.total} pending
                  </Badge>
                )}
              </div>
              {dueThisWeek.total > 0 && (
                <button
                  onClick={() => setDueExpanded(!dueExpanded)}
                  className="p-1 rounded hover:bg-muted transition-colors cursor-pointer"
                >
                  {dueExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              )}
            </div>

            {dueThisWeek.total === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <CheckCircle2 className="h-4 w-4 text-neutral-500" />
                <span className="text-sm text-foreground">No payments due this week</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-foreground">
                  <span className="font-semibold text-foreground">{dueThisWeek.total}</span>{" "}
                  payment{dueThisWeek.total !== 1 ? "s" : ""} due this week totaling{" "}
                  <span className="font-semibold text-foreground">{formatINR(dueThisWeek.totalAmount)}</span>
                </p>

                {dueExpanded && (
                  <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto">
                    {dueThisWeek.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {item.outlet_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {item.type.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Due {item.due_date ? new Date(item.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "--"}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-foreground tabular-nums flex-shrink-0">
                          {formatINR(item.amount)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1 flex-shrink-0 cursor-pointer"
                          disabled={markingPaid === item.id}
                          onClick={() => handleMarkPaid(item.id)}
                        >
                          {markingPaid === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          Paid
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Health / Snapshot */}
        {avgHealthScore !== null ? (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <HealthScoreGauge score={avgHealthScore} size="sm" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Portfolio Health</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Average across {stats?.total_agreements ?? 0} agreements
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Heart className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-foreground">
                    {avgHealthScore >= 70
                      ? "Portfolio is in good shape"
                      : avgHealthScore >= 40
                        ? "Some agreements need attention"
                        : "Multiple agreements at risk"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-neutral-500" />
                <h3 className="text-sm font-semibold text-foreground">Portfolio Snapshot</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
                  <ShieldAlert className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{stats?.total_risk_flags ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Risk Flags</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
                  <CalendarClock className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{stats?.expiring_leases_90d ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Expiring (90d)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
                  <Bell className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{stats?.pending_alerts ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Pending Alerts</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-100">
                  <IndianRupee className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-foreground leading-tight">{stats?.overdue_payments_count ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Overdue</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Quick Actions Row                                                */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Common actions for all roles */}
        <Link href="/ai-assistant">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            Gro AI
          </Button>
        </Link>
        <Link href="/agreements/upload">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            Upload Documents
          </Button>
        </Link>
        <Link href="/outlets">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <Store className="h-3.5 w-3.5" />
            View All Outlets
          </Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <BarChart3 className="h-3.5 w-3.5" />
            View Reports
          </Button>
        </Link>

        {/* platform_admin: all-org switcher & system settings */}
        {user?.role === "platform_admin" && (
          <>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
                <Settings className="h-3.5 w-3.5" />
                System Settings
              </Button>
            </Link>
          </>
        )}

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
      {isPlatformAdmin && outletsByCity.length > 0 && (
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
      )}

      {/* -------------------------------------------------------------- */}
      {/* Action alerts — only show if there are urgent items              */}
      {/* -------------------------------------------------------------- */}
      {((stats?.overdue_payments_count ?? 0) > 0) && (
        <Link href="/payments">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100/50 transition-colors cursor-pointer">
            <IndianRupee className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span className="text-sm text-rose-700">
              <span className="font-semibold">{stats?.overdue_payments_count ?? 0}</span> overdue payment{(stats?.overdue_payments_count ?? 0) !== 1 ? "s" : ""} ({formatINR(stats?.overdue_amount ?? 0)})
            </span>
          </div>
        </Link>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 2.7 -- Pipeline Summary [admin only]                         */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && stats?.pipeline_stages && Object.keys(stats.pipeline_stages).length > 0 && (
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
              {["lead", "site_visit", "negotiation", "loi", "agreement", "fitout", "operational"].map((stage) => {
                const count = stats.pipeline_stages?.[stage] ?? 0;
                return (
                  <div key={stage} className="flex-1 flex flex-col items-center py-4 px-5 min-w-[90px]">
                    <span className="text-lg font-semibold font-mono tracking-tighter">{count}</span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground text-center mt-0.5">{statusLabel(stage)}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 2.8 -- Expiring Leases + Risk Flags + Property Type cards    */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && (
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
              <div className="text-2xl font-semibold font-mono tracking-tighter text-amber-700">
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
              <div className="text-2xl font-semibold font-mono tracking-tighter text-amber-700">
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
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 3 -- Outlets by City & Status [admin only]                    */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
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
      </div>}

      {/* -------------------------------------------------------------- */}
      {/* Org Member Simplified View                                       */}
      {/* -------------------------------------------------------------- */}
      {isOrgMember && (
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
              <div className="text-2xl font-semibold font-mono tracking-tighter text-amber-700">
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
              <div className="text-2xl font-semibold font-mono tracking-tighter text-amber-700">
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
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 5 -- Gro AI Chat                                       */}
      {/* -------------------------------------------------------------- */}
      <SmartAIChat />
    </div>
  );
}
