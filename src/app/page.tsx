"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getDashboardStats, smartChat, listOutlets, listPayments, updatePayment, listAgreements, getOrgMembers } from "@/lib/api";
import { useUser } from "@/lib/hooks/use-user";
import dynamic from "next/dynamic";

const IndiaMap = dynamic(() => import("@/components/india-map"), { ssr: false });
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
  TrendingDown,
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
    default: return "#a3a3a3";
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
    default: return "#a3a3a3";
  }
}

/** Simple SVG donut chart */
// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[#e4e8ef]/50 ${className ?? ""}`}
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 2 - 3 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Row 3 - 2 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
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
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Welcome to GroSpace
        </p>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-[#f4f6f9] flex items-center justify-center mb-4">
            <Rocket className="h-6 w-6 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Get Started with GroSpace</h2>
          <p className="text-sm text-neutral-500 max-w-md mb-6">
            Upload your first document to start tracking outlets,
            obligations, and alerts across your portfolio.
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
// GroBot Chat Component
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
          <li key={i} className="text-sm text-neutral-600 ml-4 list-disc">
            {line.replace(/^[-•]\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1")}
          </li>
        );
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return (
        <p key={i} className="text-sm text-neutral-600">
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
            <Sparkles className="h-4 w-4 text-neutral-600" />
            <CardTitle className="text-sm font-semibold">GroBot</CardTitle>
            <Badge variant="outline" className="text-[10px]">AI</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ai-assistant"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-neutral-400 hover:text-neutral-600 flex items-center gap-1 transition-colors"
            >
              Full view <ExternalLink className="w-3 h-3" />
            </Link>
            <Badge variant="outline" className="text-[10px]">
              {isOpen ? "Collapse" : "Expand"}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-neutral-400 mt-0.5">
          Ask anything about your portfolio — escalation, risk, payments, expiry
        </p>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 pt-2">
          {/* Chat Messages */}
          <div className="border border-[#e4e8ef] rounded-lg bg-[#f4f6f9]/50 h-[300px] overflow-y-auto p-3 mb-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <MessageSquare className="h-8 w-8 text-neutral-300" />
                <div>
                  <p className="text-sm text-neutral-500 font-medium">Ask your portfolio a question</p>
                  <p className="text-xs text-neutral-400 mt-1">Pick a category or type your own question</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "ai" && (
                  <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-[#132337] text-white"
                      : "bg-[#fafbfd] border border-[#e4e8ef] text-neutral-700"
                  }`}
                >
                  {msg.role === "user" ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div>{formatAIContent(msg.content)}</div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-[#e4e8ef] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-neutral-600" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-[#fafbfd] border border-[#e4e8ef] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                    <span className="text-xs text-neutral-400">Analyzing...</span>
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
                          ? "bg-[#132337] text-white border-[#132337]"
                          : "bg-[#fafbfd] border-[#e4e8ef] text-neutral-500 hover:bg-[#f4f6f9]"
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
                        className="text-xs bg-[#fafbfd] border border-[#e4e8ef] rounded-full px-3 py-1.5 text-neutral-600 hover:bg-[#f4f6f9] transition-colors disabled:opacity-50"
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
                      className="text-xs bg-[#fafbfd] border border-[#e4e8ef] rounded-full px-3 py-1.5 text-neutral-600 hover:bg-[#f4f6f9] transition-colors disabled:opacity-50"
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
                  className="text-[10px] text-neutral-400 hover:text-neutral-600 border border-[#e4e8ef] rounded-full px-2.5 py-1 whitespace-nowrap transition-colors disabled:opacity-50"
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
  const [mapCluster, setMapCluster] = useState<{
    label: string;
    cities: string[];
    count: number;
    outlets: { name: string; status: string; rent?: number }[];
  } | null>(null);
  const [propertyTypeCounts, setPropertyTypeCounts] = useState<Record<string, number>>({});
  const mapSectionRef = useRef<HTMLDivElement>(null);

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
      color: "bg-[#132337]/10 text-[#132337] border-[#132337]/20",
      icon: <Shield className="h-3 w-3" />,
    },
    org_admin: {
      badge: "Admin",
      color: "bg-[#132337]/[0.08] text-[#132337]/80 border-[#132337]/[0.15]",
      icon: <Users className="h-3 w-3" />,
    },
    org_member: {
      badge: "Member",
      color: "bg-[#f4f6f9] text-neutral-700 border-[#e4e8ef]",
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
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <Card className="border-red-200">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <AlertTriangle className="h-8 w-8 text-red-400 mb-3" />
            <p className="text-sm font-medium text-red-700 mb-1">
              Failed to load dashboard
            </p>
            <p className="text-xs text-neutral-500 mb-4">{error}</p>
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
    <div className="space-y-6 animate-fade-in">
      {/* -------------------------------------------------------------- */}
      {/* Page heading                                                     */}
      {/* -------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <Badge className={`text-[10px] gap-1 px-2 py-0.5 border ${currentTier.color}`}>
              {currentTier.icon}
              {currentTier.badge}
            </Badge>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            {user?.role === "platform_admin"
              ? `System-wide overview across ${stats?.total_outlets ?? 0} outlets and ${stats?.total_agreements ?? 0} agreements`
              : isPlatformAdmin
                ? `Organization overview — ${stats?.total_outlets ?? 0} outlets, ${stats?.total_agreements ?? 0} agreements`
                : `Your portfolio — ${stats?.total_outlets ?? 0} outlets, ${stats?.pending_alerts ?? 0} pending alerts`}
          </p>
        </div>
        {user?.role === "platform_admin" && (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="gap-1 text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50">
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
      {/* Portfolio Health + Due This Week row                              */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
        {/* Portfolio Health Score */}
        {avgHealthScore !== null && (
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <HealthScoreGauge score={avgHealthScore} size="sm" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[#132337]">Portfolio Health</h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Average across {stats?.total_agreements ?? 0} agreements
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Heart className="h-3 w-3 text-neutral-400" />
                  <span className="text-xs text-neutral-600">
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
        )}

        {/* Due This Week Widget */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-neutral-500" />
                <h3 className="text-sm font-semibold text-[#132337]">Due This Week</h3>
              </div>
              {dueThisWeek.total > 0 && (
                <button
                  onClick={() => setDueExpanded(!dueExpanded)}
                  className="p-1 rounded hover:bg-[#f4f6f9] transition-colors"
                >
                  {dueExpanded ? (
                    <ChevronUp className="h-4 w-4 text-neutral-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-neutral-400" />
                  )}
                </button>
              )}
            </div>

            {dueThisWeek.total === 0 ? (
              <div className="flex items-center gap-2 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-neutral-600">No payments due this week</span>
              </div>
            ) : (
              <>
                <p className="text-sm text-neutral-700">
                  <span className="font-semibold text-[#132337]">{dueThisWeek.total}</span>{" "}
                  payment{dueThisWeek.total !== 1 ? "s" : ""} due this week totaling{" "}
                  <span className="font-semibold text-[#132337]">{formatINR(dueThisWeek.totalAmount)}</span>
                </p>

                {dueExpanded && (
                  <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto">
                    {dueThisWeek.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-[#e4e8ef] bg-[#fafbfd]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#132337] truncate">
                            {item.outlet_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-neutral-500 capitalize">
                              {item.type.replace(/_/g, " ")}
                            </span>
                            <span className="text-[10px] text-neutral-400">
                              Due {item.due_date ? new Date(item.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "--"}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#132337] tabular-nums flex-shrink-0">
                          {formatINR(item.amount)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1 flex-shrink-0"
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
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Quick Actions Row (top)                                          */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Common actions for all roles */}
        <Link href="/ai-assistant">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            GroBot
          </Button>
        </Link>
        <Link href="/agreements/upload">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Upload className="h-3.5 w-3.5" />
            Upload Documents
          </Button>
        </Link>
        <Link href="/outlets">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Store className="h-3.5 w-3.5" />
            View All Outlets
          </Button>
        </Link>
        <Link href="/reports">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5" />
            View Reports
          </Button>
        </Link>

        {/* platform_admin: all-org switcher & system settings */}
        {user?.role === "platform_admin" && (
          <>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Settings className="h-3.5 w-3.5" />
                System Settings
              </Button>
            </Link>
          </>
        )}

        {/* org_admin: team management shortcuts */}
        {user?.role === "org_admin" && (
          <Link href="/settings">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Manage Team
            </Button>
          </Link>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 1 -- Primary stat cards (4 columns)                          */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {/* Total Outlets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Total Outlets
            </CardTitle>
            <Store className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {stats?.total_outlets ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Across all locations
            </p>
          </CardContent>
        </Card>

        {/* Active Agreements */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Active Agreements
            </CardTitle>
            <FileCheck className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {stats?.active_agreements ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              of {stats?.total_agreements ?? 0} total
            </p>
          </CardContent>
        </Card>

        {/* Monthly Rent Exposure */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Monthly Rent Exposure
            </CardTitle>
            <IndianRupee className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {formatINR(stats?.total_monthly_rent ?? 0)}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Total monthly rent
            </p>
          </CardContent>
        </Card>

        {/* Pending Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Pending Alerts
            </CardTitle>
            <Bell className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-semibold ${(stats?.pending_alerts ?? 0) > 0 ? "text-amber-600" : ""}`}>
              {stats?.pending_alerts ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Require attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Map Teaser -- links to dedicated Map View page                     */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && outletsByCity.length > 0 && (
        <button
          onClick={() => mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="w-full group block"
        >
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#e4e8ef] bg-[#fafbfd] hover:border-[#132337]/20 hover:shadow-sm transition-all duration-200 cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#132337] flex items-center justify-center">
                <Map className="h-4 w-4 text-white" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-neutral-800">Outlet Map</p>
                <p className="text-[10px] text-neutral-400">
                  {outletsByCity.length} {outletsByCity.length === 1 ? "city" : "cities"} &middot; Scroll to interactive map
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-400 group-hover:text-[#132337] transition-colors">
              <span className="text-[10px] font-medium hidden sm:inline">Scroll to map</span>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </button>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 2 -- Secondary stat cards (3 columns) [admin/org_admin only] */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
        {/* Expiring Leases (90 days) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Expiring Leases (90d)
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-semibold ${(stats?.expiring_leases_90d ?? 0) > 0 ? "text-red-600" : ""}`}>
              {stats?.expiring_leases_90d ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Within the next 90 days
            </p>
          </CardContent>
        </Card>

        {/* Total Risk Flags */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Total Risk Flags
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-semibold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-600" : ""}`}>
              {stats?.total_risk_flags ?? 0}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Across all agreements
            </p>
          </CardContent>
        </Card>

        {/* Total Monthly Outflow */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-neutral-500">
              Total Monthly Outflow
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-neutral-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-semibold">
              {formatINR(stats?.total_monthly_outflow ?? 0)}
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Rent + CAM + all charges
            </p>
          </CardContent>
        </Card>
      </div>}

      {/* -------------------------------------------------------------- */}
      {/* Row 2.5 -- Expiring Leases + Risk Flags + Overdue inline badges  */}
      {/* -------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Overdue payments badge */}
        {(stats?.overdue_payments_count ?? 0) > 0 && (
          <Link href="/payments">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50/80 hover:bg-red-50 transition-colors cursor-pointer">
              <IndianRupee className="h-4 w-4 text-red-600 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-red-700">
                  {stats?.overdue_payments_count ?? 0}
                </span>
                <span className="text-xs text-red-600">
                  overdue ({formatINR(stats?.overdue_amount ?? 0)})
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Expiring Leases mini-widget */}
        {(stats?.expiring_leases_90d ?? 0) > 0 && (
          <Link href="/alerts">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/80 hover:bg-amber-50 transition-colors cursor-pointer">
              <CalendarClock className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-amber-700">
                  {stats?.expiring_leases_90d ?? 0}
                </span>
                <span className="text-xs text-amber-600">
                  lease{(stats?.expiring_leases_90d ?? 0) !== 1 ? "s" : ""} expiring in 90 days
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Expiring Licenses mini-widget */}
        {((stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)) > 0 && (
          <Link href="/agreements">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50/80 hover:bg-amber-50 transition-colors cursor-pointer">
              <FileCheck className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                {(stats?.expiring_licenses_30d ?? 0) > 0 && (
                  <span className="text-sm font-semibold text-red-700">{stats?.expiring_licenses_30d}</span>
                )}
                <span className="text-xs text-amber-600">
                  {(stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)} license{((stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)) !== 1 ? "s" : ""} expiring in 90 days
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Risk Flags summary badge */}
        {(stats?.total_risk_flags ?? 0) > 0 && (
          <Link href="/agreements">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 bg-red-50/80 hover:bg-red-50 transition-colors cursor-pointer">
              <ShieldAlert className="h-4 w-4 text-red-500 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-red-700">
                  {stats?.total_risk_flags ?? 0}
                </span>
                <span className="text-xs text-red-600">
                  risk flag{(stats?.total_risk_flags ?? 0) !== 1 ? "s" : ""} across agreements
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Pending alerts badge */}
        {(stats?.pending_alerts ?? 0) > 0 && (
          <Link href="/alerts">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e4e8ef] bg-[#f4f6f9] hover:bg-[#e4e8ef]/50 transition-colors cursor-pointer">
              <Bell className="h-4 w-4 text-neutral-500 flex-shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-700">
                  {stats?.pending_alerts ?? 0}
                </span>
                <span className="text-xs text-neutral-500">
                  pending alert{(stats?.pending_alerts ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 2.7 -- Pipeline Summary [admin only]                         */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && stats?.pipeline_stages && Object.keys(stats.pipeline_stages).length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Deal Pipeline</CardTitle>
              <Link href="/pipeline">
                <Badge variant="outline" className="text-[10px] cursor-pointer hover:bg-[#f4f6f9]">
                  View Pipeline
                </Badge>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex gap-2 overflow-x-auto">
              {["lead", "site_visit", "negotiation", "loi", "agreement", "fitout", "operational"].map((stage) => {
                const count = stats.pipeline_stages?.[stage] ?? 0;
                if (count === 0) return null;
                return (
                  <div key={stage} className="flex flex-col items-center min-w-[80px] rounded-lg border border-[#e4e8ef] p-2.5">
                    <span className="text-lg font-bold">{count}</span>
                    <span className="text-[10px] text-neutral-500 text-center">{statusLabel(stage)}</span>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
          {/* Expiring Leases Card */}
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-amber-700">
                Expiring Leases
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold text-amber-700">
                {stats?.expiring_leases_90d ?? 0}
              </div>
              <p className="text-xs text-amber-600/80 mt-1">
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
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-amber-700">
                Expiring Licenses
              </CardTitle>
              <FileCheck className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold text-amber-700">
                {(stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_30d ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-400"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {stats?.expiring_licenses_30d ?? 0} &lt;30d
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_60d ?? 0) > 0 ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-400"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {stats?.expiring_licenses_60d ?? 0} 30-60d
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_90d ?? 0) > 0 ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"}`}>
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
          <Card className={`${(stats?.total_risk_flags ?? 0) > 0 ? "border-red-200 bg-red-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className={`text-xs font-medium ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                Risk Flags Summary
              </CardTitle>
              <ShieldAlert className={`h-4 w-4 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-500" : "text-emerald-500"}`} />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={`text-3xl font-bold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {stats?.total_risk_flags ?? 0}
              </div>
              <p className={`text-xs mt-1 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-600/80" : "text-emerald-600/80"}`}>
                {(stats?.total_risk_flags ?? 0) > 0
                  ? "Total risk flags across all agreements"
                  : "No risk flags — portfolio looks healthy"}
              </p>
              {(stats?.total_risk_flags ?? 0) > 0 && (
                <Link href="/agreements" className="inline-block mt-2">
                  <Button variant="outline" size="sm" className="text-[11px] h-7 border-red-300 text-red-700 hover:bg-red-100">
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
                <p className="text-xs text-neutral-400">No property type data yet.</p>
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
                              <span className="text-xs text-neutral-700">{statusLabel(type)}</span>
                            </div>
                            <span className="text-xs font-semibold tabular-nums">{count}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[#132337]/10 overflow-hidden">
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
      {/* Row 3 -- India Map + Outlets by City & Status [admin only]        */}
      {/* -------------------------------------------------------------- */}
      {isPlatformAdmin && <div ref={mapSectionRef} className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-5 scroll-mt-4">
        {/* India Map -- 3 columns */}
        <Card className="flex flex-col lg:col-span-3 overflow-hidden shadow-sm">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-[#132337] flex items-center justify-center">
                <MapPin className="h-3 w-3 text-white" />
              </div>
              <CardTitle className="text-sm font-semibold">
                Outlet Locations
              </CardTitle>
              <Badge variant="secondary" className="text-[10px] ml-auto font-semibold">
                {stats?.total_outlets ?? 0} outlets
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {outletsByCity.length === 0 ? (
              <p className="text-xs text-neutral-400">No outlet data yet.</p>
            ) : (
              <IndiaMap
                outletsByCity={stats?.outlets_by_city || {}}
                outletDetails={stats?.outlet_details_by_city}
                selectedCluster={mapCluster?.label ?? null}
                onSelectCluster={setMapCluster}
                compact
              />
            )}
          </CardContent>
        </Card>

        {/* Right side -- City list (or selected cluster outlets) + Status */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-5">
          {/* Outlets by City / Selected cluster detail */}
          <Card className="flex flex-col overflow-hidden">
            <CardHeader className="p-4 pb-3">
              {mapCluster ? (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#132337] flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-semibold truncate">
                      {mapCluster.label}
                    </CardTitle>
                    {mapCluster.cities.length > 1 && (
                      <p className="text-[10px] text-neutral-400 truncate">
                        {mapCluster.cities.join(" \u2022 ")}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    {mapCluster.count} outlets
                  </Badge>
                  <button
                    onClick={() => setMapCluster(null)}
                    className="w-6 h-6 rounded-full bg-[#f4f6f9] hover:bg-[#e4e8ef] flex items-center justify-center text-neutral-400 hover:text-neutral-700 transition-all"
                  >
                    <span className="text-xs leading-none">&times;</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-[#132337] flex items-center justify-center">
                    <MapPin className="h-3 w-3 text-white" />
                  </div>
                  <CardTitle className="text-sm font-semibold">
                    Outlets by City
                  </CardTitle>
                  <Badge variant="secondary" className="text-[10px] ml-auto font-semibold">
                    {outletsByCity.reduce((s, c) => s + c.count, 0)} total
                  </Badge>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {mapCluster ? (
                mapCluster.outlets.length > 0 ? (
                  <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                    {mapCluster.outlets.map((outlet, i) => {
                      const sColor =
                        outlet.status === "operational" ? "#10b981" :
                        outlet.status === "closed" ? "#ef4444" :
                        outlet.status === "up_for_renewal" ? "#f59e0b" :
                        outlet.status === "fit_out" ? "#f59e0b" : "#a3a3a3";
                      return (
                        <div
                          key={i}
                          className="group flex items-center gap-3 py-2.5 px-3 rounded-xl border border-transparent hover:border-[#e4e8ef] hover:bg-gradient-to-r hover:from-[#f4f6f9] hover:to-[#fafbfd] hover:shadow-sm transition-all duration-200 cursor-pointer"
                        >
                          <div className="relative flex-shrink-0">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: sColor, boxShadow: `0 0 0 3px ${sColor}20` }}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-neutral-800 group-hover:text-[#132337] truncate transition-colors font-medium">
                              {outlet.name}
                            </p>
                            <p className="text-[10px] text-neutral-400 capitalize mt-0.5">
                              {outlet.status?.replace(/_/g, " ")}
                            </p>
                          </div>
                          {outlet.rent ? (
                            <span className="text-[11px] text-neutral-600 group-hover:text-neutral-800 tabular-nums flex-shrink-0 font-semibold transition-colors">
                              {`\u20B9${Math.round(outlet.rent).toLocaleString("en-IN")}`}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">
                    {mapCluster.count} outlet{mapCluster.count > 1 ? "s" : ""} in this area
                  </p>
                )
              ) : outletsByCity.length === 0 ? (
                <p className="text-xs text-neutral-400">No outlet data yet.</p>
              ) : (
                <div className="space-y-3">
                  {outletsByCity.map(({ city, count }) => {
                    const pct = (count / maxCityCount) * 100;
                    return (
                      <div key={city} className="group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-neutral-600 group-hover:text-[#132337] transition-colors">{city}</span>
                          <span className="text-xs font-semibold text-neutral-800 tabular-nums">{count}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#132337]/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#132337] transition-all duration-700 ease-out"
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
                <div className="w-6 h-6 rounded-lg bg-[#132337] flex items-center justify-center">
                  <Activity className="h-3 w-3 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold">
                  Outlets by Status
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {outletsByStatus.length === 0 ? (
                <p className="text-xs text-neutral-400">No outlet data yet.</p>
              ) : (
                <div className="space-y-2">
                  {outletsByStatus
                    .sort((a, b) => b.count - a.count)
                    .map(({ status, count }) => {
                      const total = outletsByStatus.reduce((s, c) => s + c.count, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      const color = statusColor(status);
                      return (
                        <div key={status} className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f4f6f9] transition-all duration-200">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
                          >
                            <span className="text-sm font-bold" style={{ color }}>{count}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-neutral-700">{statusLabel(status)}</span>
                              <span className="text-[10px] font-semibold text-neutral-400">{pct}%</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[#132337]/10 overflow-hidden">
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
                <div className="w-6 h-6 rounded-lg bg-[#132337] flex items-center justify-center">
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
                <p className="text-xs text-neutral-400">No rent data yet.</p>
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
                          <span className="text-xs font-medium text-neutral-600">{city}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-neutral-400">{pct}%</span>
                            <span className="text-xs font-semibold text-[#132337] tabular-nums">{formatINR(cityRent)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#132337]/10 overflow-hidden">
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
                    <div className="mt-2 pt-2 border-t border-[#e4e8ef] flex items-center justify-between">
                      <span className="text-[11px] text-neutral-500">Avg rent per outlet</span>
                      <span className="text-xs font-bold text-[#132337] tabular-nums">
                        {formatINR((stats?.total_monthly_rent ?? 0) / (stats?.total_outlets ?? 1))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>}

      {/* -------------------------------------------------------------- */}
      {/* Org Member Simplified View                                       */}
      {/* -------------------------------------------------------------- */}
      {isOrgMember && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
          {/* Expiring Leases Card (org_member view) */}
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-amber-700">
                Expiring Leases
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold text-amber-700">
                {stats?.expiring_leases_90d ?? 0}
              </div>
              <p className="text-xs text-amber-600/80 mt-1">
                Agreements expiring within 90 days
              </p>
            </CardContent>
          </Card>

          {/* Expiring Licenses Card (org_member view) */}
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-amber-700">
                Expiring Licenses
              </CardTitle>
              <FileCheck className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-3xl font-bold text-amber-700">
                {(stats?.expiring_licenses_30d ?? 0) + (stats?.expiring_licenses_60d ?? 0) + (stats?.expiring_licenses_90d ?? 0)}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_30d ?? 0) > 0 ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-400"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {stats?.expiring_licenses_30d ?? 0} &lt;30d
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_60d ?? 0) > 0 ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-400"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {stats?.expiring_licenses_60d ?? 0} 30-60d
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${(stats?.expiring_licenses_90d ?? 0) > 0 ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-400"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {stats?.expiring_licenses_90d ?? 0} 60-90d
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Risk Flags (org_member view) */}
          <Card className={`${(stats?.total_risk_flags ?? 0) > 0 ? "border-red-200 bg-red-50/30" : "border-emerald-200 bg-emerald-50/30"}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
              <CardTitle className={`text-xs font-medium ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                Risk Flags
              </CardTitle>
              <ShieldAlert className={`h-4 w-4 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-500" : "text-emerald-500"}`} />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className={`text-3xl font-bold ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-700" : "text-emerald-700"}`}>
                {stats?.total_risk_flags ?? 0}
              </div>
              <p className={`text-xs mt-1 ${(stats?.total_risk_flags ?? 0) > 0 ? "text-red-600/80" : "text-emerald-600/80"}`}>
                {(stats?.total_risk_flags ?? 0) > 0
                  ? "Flags needing your attention"
                  : "All clear — no risk flags"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Row 5 -- GroBot Chat                                        */}
      {/* -------------------------------------------------------------- */}
      <SmartAIChat />
    </div>
  );
}
