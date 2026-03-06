"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { getDashboardStats, askPortfolioQuestion, smartChat } from "@/lib/api";
import dynamic from "next/dynamic";

const IndiaMap = dynamic(() => import("@/components/india-map"), { ssr: false });
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
  Bot,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  User,
  MapPin,
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
  outlets_by_city: Record<string, number>;
  outlets_by_status: Record<string, number>;
  outlet_details_by_city?: Record<string, { name: string; status: string; rent?: number }[]>;
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

/** Return Tailwind color classes for outlet status badges */
function statusBadgeClasses(status: string): string {
  switch (status) {
    case "operational":
      return "border-green-200 text-green-700 bg-green-50";
    case "fit_out":
      return "border-amber-200 text-amber-700 bg-amber-50";
    case "closed":
      return "border-red-200 text-red-700 bg-red-50";
    case "under_construction":
      return "border-blue-200 text-blue-700 bg-blue-50";
    default:
      return "border-neutral-200 text-neutral-600 bg-neutral-50";
  }
}

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200/60 ${className ?? ""}`}
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
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
            <Rocket className="h-6 w-6 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold mb-1">Get Started with GroSpace</h2>
          <p className="text-sm text-neutral-500 max-w-md mb-6">
            Upload your first lease agreement to start tracking outlets,
            obligations, and alerts across your portfolio.
          </p>
          <div className="flex gap-3">
            <Link href="/agreements/upload">
              <Button size="sm">
                <Upload className="h-4 w-4" />
                Upload Agreement
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
// Portfolio Q&A Component
// ---------------------------------------------------------------------------

type PortfolioMessage = {
  role: "user" | "assistant";
  content: string;
  data?: Record<string, unknown>[];
};

const SUGGESTED_QUESTIONS = [
  "Leases expiring this year",
  "Total rent exposure by city",
  "Overdue payments",
  "Outlets by deal stage",
];

function PortfolioQA() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PortfolioMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleAsk(questionOverride?: string) {
    const question = (questionOverride || input).trim();
    if (!question || loading) return;

    setInput("");
    setExpanded(true);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await askPortfolioQuestion(question);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer || "No answer received.",
          data: res.data,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <CardTitle className="text-sm font-semibold">
            Ask about your portfolio
          </CardTitle>
          <Badge variant="secondary" className="text-[10px] ml-auto">
            AI-Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {/* Suggested chips (shown when no messages) */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => handleAsk(q)}
                disabled={loading}
                className="text-xs bg-neutral-50 border border-neutral-200 rounded-full px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:border-neutral-300 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="h-3 w-3 text-neutral-400" />
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Messages (collapsible) */}
        {expanded && messages.length > 0 && (
          <div className="mb-3 max-h-[300px] overflow-y-auto space-y-3 border border-neutral-100 rounded-lg p-3">
            {messages.map((msg, i) => (
              <div key={i} className="flex items-start gap-2">
                {msg.role === "assistant" ? (
                  <div className="h-6 w-6 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-neutral-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-neutral-400 mb-0.5">
                    {msg.role === "assistant" ? "GroSpace AI" : "You"}
                  </p>
                  <div className={`text-sm whitespace-pre-wrap ${msg.role === "user" ? "font-medium" : ""}`}>
                    {msg.content}
                  </div>
                  {msg.data && msg.data.length > 0 && (
                    <div className="mt-2 border border-neutral-100 rounded-lg overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="bg-neutral-50">
                            {Object.keys(msg.data[0]).map((key) => (
                              <th key={key} className="px-3 py-1.5 text-left font-medium text-neutral-500 whitespace-nowrap">
                                {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {msg.data.slice(0, 10).map((row, ri) => (
                            <tr key={ri} className="border-t border-neutral-50">
                              {Object.values(row).map((val, vi) => (
                                <td key={vi} className="px-3 py-1.5 whitespace-nowrap">
                                  {val == null ? "--" : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {msg.data.length > 10 && (
                        <p className="text-[10px] text-neutral-400 px-3 py-1">
                          Showing 10 of {msg.data.length} results
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-neutral-400 pl-8">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing your portfolio...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Ask about your portfolio..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
              }
            }}
            disabled={loading}
            className="flex-1 h-9 text-sm"
          />
          <Button
            onClick={() => handleAsk()}
            disabled={!input.trim() || loading}
            size="sm"
            className="gap-1.5 h-9 px-3"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
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
// Smart AI Chat Component
// ---------------------------------------------------------------------------

function SmartAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const data = await smartChat(question);
      setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: `Sorry, I couldn't process that. ${err instanceof Error ? err.message : "Please try again."}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "Where am I struggling with escalation?",
    "Which outlets have the highest risk?",
    "Show me overdue payments summary",
    "What leases expire in the next 90 days?",
  ];

  return (
    <Card>
      <CardHeader
        className="p-4 pb-2 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-neutral-600" />
            <CardTitle className="text-sm font-semibold">AI Assistant</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {isOpen ? "Collapse" : "Expand"}
          </Badge>
        </div>
        <p className="text-xs text-neutral-400 mt-0.5">
          Ask anything about your portfolio — escalation, risk, payments, expiry
        </p>
      </CardHeader>

      {isOpen && (
        <CardContent className="p-4 pt-2">
          {/* Chat Messages */}
          <div className="border border-neutral-200 rounded-lg bg-neutral-50/50 h-[300px] overflow-y-auto p-3 mb-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <MessageSquare className="h-8 w-8 text-neutral-300" />
                <div>
                  <p className="text-sm text-neutral-500 font-medium">Ask your portfolio a question</p>
                  <p className="text-xs text-neutral-400 mt-1">Try one of the suggestions below</p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "ai" && (
                  <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-black text-white"
                      : "bg-white border border-neutral-200 text-neutral-700"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3 h-3 text-neutral-600" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setInput(s);
                  }}
                  className="text-xs bg-white border border-neutral-200 rounded-full px-3 py-1.5 text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <Input
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
              onClick={handleSend}
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Platform overview across {stats?.total_outlets ?? 0} outlets and{" "}
          {stats?.total_agreements ?? 0} agreements
        </p>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Portfolio Q&A                                                    */}
      {/* -------------------------------------------------------------- */}
      <PortfolioQA />

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
      {/* Row 2 -- Secondary stat cards (3 columns)                        */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-5">
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
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 3 -- India Map + Outlets by City & Status                    */}
      {/* -------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-5">
        {/* India Map -- 3 columns */}
        <Card className="flex flex-col lg:col-span-3">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-neutral-500" />
              <CardTitle className="text-sm font-semibold">
                Outlet Locations
              </CardTitle>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {stats?.total_outlets ?? 0} outlets
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {outletsByCity.length === 0 ? (
              <p className="text-xs text-neutral-400">No outlet data yet.</p>
            ) : (
              <IndiaMap
                outletsByCity={stats?.outlets_by_city || {}}
                outletDetails={stats?.outlet_details_by_city}
              />
            )}
          </CardContent>
        </Card>

        {/* Right side -- City list + Status */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-5">
          {/* Outlets by City -- compact bar chart */}
          <Card className="flex flex-col">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">
                Outlets by City
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {outletsByCity.length === 0 ? (
                <p className="text-xs text-neutral-400">No outlet data yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {outletsByCity.map(({ city, count }) => (
                    <div key={city}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-neutral-700">{city}</span>
                        <span className="text-xs font-semibold">{count}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-neutral-800 transition-all"
                          style={{
                            width: `${(count / maxCityCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Outlets by Status */}
          <Card className="flex flex-col">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">
                Outlets by Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              {outletsByStatus.length === 0 ? (
                <p className="text-xs text-neutral-400">No outlet data yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {outletsByStatus.map(({ status, count }) => (
                    <div
                      key={status}
                      className="rounded-lg border border-neutral-100 p-2.5 flex items-center justify-between"
                    >
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusBadgeClasses(status)}`}
                      >
                        {statusLabel(status)}
                      </Badge>
                      <span className="text-base font-bold">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* -------------------------------------------------------------- */}
      {/* Row 4 -- Quick Actions                                           */}
      {/* -------------------------------------------------------------- */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="flex flex-wrap gap-3">
            <Link href="/agreements/upload">
              <Button size="sm">
                <Upload className="h-4 w-4" />
                Upload Agreement
              </Button>
            </Link>
            <Link href="/alerts">
              <Button variant="outline" size="sm">
                <Bell className="h-4 w-4" />
                View Alerts
              </Button>
            </Link>
            <Link href="/reports">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4" />
                View Reports
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* -------------------------------------------------------------- */}
      {/* Row 5 -- Smart AI Chat                                          */}
      {/* -------------------------------------------------------------- */}
      <SmartAIChat />
    </div>
  );
}
