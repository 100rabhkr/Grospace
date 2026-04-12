"use client";

import { useState, useEffect, useRef } from "react";
import { smartChat, listOutlets } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  Loader2,
  User,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  FileText,
  RotateCcw,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

const SUGGESTION_CATEGORIES = [
  {
    icon: AlertTriangle,
    label: "Portfolio Risk Scan",
    questions: [
      "Which leases have escalation above 10%?",
      "Which leases expire in the next 90 days?",
      "Are there any leases without force majeure clauses?",
    ],
  },
  {
    icon: TrendingUp,
    label: "Rent Analysis",
    questions: [
      "What is my total monthly rent exposure?",
      "Which outlets have the highest rent per sqft?",
      "Show me outlets with revenue share models",
    ],
  },
  {
    icon: FileText,
    label: "Compliance Check",
    questions: [
      "Which outlets are missing security deposits?",
      "Are all leases within standard lock-in periods?",
      "Which agreements have no exclusivity clause?",
    ],
  },
  {
    icon: Lightbulb,
    label: "Lease Health",
    questions: [
      "Which agreements have the most risk flags?",
      "Show me agreements expiring without renewal terms",
      "Which outlets need rent renegotiation?",
    ],
  },
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [outletFilter, setOutletFilter] = useState("all");
  const [outlets, setOutlets] = useState<{ id: string; name: string; city: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch outlets for the scope filter
  useEffect(() => {
    listOutlets({ page: 1, page_size: 200 }).then(data => {
      setOutlets((data.items || []).map((o: Record<string, unknown>) => ({
        id: o.id as string, name: o.name as string, city: (o.city as string) || "",
      })));
    }).catch(() => {});
  }, []);

  // Hydrate chat history from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("gro_ai_history");
      if (saved) {
        const parsed = JSON.parse(saved) as { role: string; content: string; timestamp: string }[];
        setMessages(parsed.slice(-50).map(m => ({ ...m, role: m.role as "user" | "ai", timestamp: new Date(m.timestamp) })));
      }
    } catch { /* ignore */ }
  }, []);

  // Persist chat history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("gro_ai_history", JSON.stringify(messages.slice(-50)));
    } catch { /* quota exceeded */ }
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSend(question?: string) {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q, timestamp: new Date() }]);
    setLoading(true);

    try {
      // Add outlet context to the question if a specific outlet is selected
      const contextQ = outletFilter !== "all"
        ? `[Context: Answer specifically about outlet "${outlets.find(o => o.id === outletFilter)?.name || outletFilter}"] ${q}`
        : q;
      // Pass conversation history for context retention
      const history = messages.slice(-10).map(m => ({ role: m.role === "user" ? "user" : "assistant", message: m.content }));
      const data = await smartChat(contextQ, undefined, outletFilter !== "all" ? outletFilter : undefined, history);
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: data.answer, timestamp: new Date() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: `I apologize, I couldn't process that request. ${err instanceof Error ? err.message : "Please try again."}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function formatAIContent(content: string) {
    // Simple markdown-like formatting
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
          <li key={i} className="text-sm text-foreground/70 ml-4 list-disc">
            {line.replace(/^[-•]\s*/, "").replace(/\*\*(.*?)\*\*/g, "$1")}
          </li>
        );
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return (
        <p key={i} className="text-sm text-foreground/70">
          {line.replace(/\*\*(.*?)\*\*/g, "$1")}
        </p>
      );
    });
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Thin top control bar — replaces PageHeader */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background shrink-0">
            <Bot className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold tracking-tight text-foreground leading-none">Gro AI</h1>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">Portfolio copilot</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {outlets.length > 0 && (
            <Select value={outletFilter} onValueChange={setOutletFilter}>
              <SelectTrigger className="w-[160px] h-8 text-[12px]">
                <SelectValue placeholder="All Outlets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outlets</SelectItem>
                {outlets.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.name}{o.city ? ` — ${o.city}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {messages.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setMessages([]); try { localStorage.removeItem("gro_ai_history"); } catch {} }}>
              <RotateCcw className="h-3.5 w-3.5" />
              New Chat
            </Button>
          )}
          <Badge variant="outline" className="hidden md:inline-flex">
            Powered by 360Labs
          </Badge>
        </div>
      </div>

      {/* Conversation / Welcome area — fills remaining space, scrolls only if needed */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {messages.length === 0 ? (
          /* Welcome screen — fits in one viewport, no scroll */
          <div className="h-full flex flex-col items-center justify-center max-w-5xl mx-auto px-8 py-6">
            <h2 className="text-[26px] font-semibold tracking-tight text-foreground">
              How can I help?
            </h2>
            <p className="text-[14px] text-muted-foreground text-center mt-2 mb-8 max-w-md">
              Ask anything about your portfolio, agreements, outlets, payments, or real estate.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
              {SUGGESTION_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Card
                    key={cat.label}
                    variant="default"
                    className="p-5 transition-all duration-base ease-out-quint hover:-translate-y-0.5 hover:elevation-2 hover:border-border-strong cursor-default will-change-transform"
                  >
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-foreground" strokeWidth={1.85} />
                      </div>
                      <span className="text-[13px] font-semibold tracking-tight text-foreground">
                        {cat.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {cat.questions.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="w-full text-left text-[12.5px] text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md px-2.5 py-2 transition-colors duration-fast font-medium leading-snug"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          /* Chat messages — scrolls inside */
          <div className="h-full overflow-y-auto max-w-3xl mx-auto py-4 space-y-4 px-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "ai" && (
                  <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-foreground text-white"
                      : "border-l-2 border-emerald-300 pl-3 py-2"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <div>{formatAIContent(msg.content)}</div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-foreground/60" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground pl-1 py-2">
                  <span>Thinking</span>
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: "0ms"}} />
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: "150ms"}} />
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{animationDelay: "300ms"}} />
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input dock — elevated, floating feel */}
      <div className="px-4 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 elevation-2 focus-within:border-border-strong transition-colors"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Gro AI anything about your portfolio…"
              className="flex-1 border-none shadow-none focus-visible:ring-0 h-10"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon" className="shrink-0">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" strokeWidth={2} />
              )}
            </Button>
          </form>
          {messages.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-hide">
              {["Show overdue payments", "Portfolio health", "Expiring leases", "Rent per sqft analysis", "Risk flags summary"].map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border rounded-full px-3 py-1.5 whitespace-nowrap transition-colors duration-fast disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
