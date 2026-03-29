"use client";

import { useState, useEffect, useRef } from "react";
import { smartChat } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  User,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";

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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      const data = await smartChat(q);
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
    <div className="flex flex-col h-[calc(100vh-32px)] animate-fade-in">
      <PageHeader
        title="Grow AI"
        description="Your intelligent real estate portfolio assistant"
       
      >
        <Badge variant="outline" className="text-xs gap-1">
          <Sparkles className="w-3 h-3" />
          Powered by 360Labs
        </Badge>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-1">
        {messages.length === 0 ? (
          /* Welcome screen with suggestions */
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4">
            <div className="w-14 h-14 rounded-2xl bg-foreground flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-1">
              Grow AI
            </h2>
            <p className="text-sm text-foreground/50 text-center mb-6">
              Ask me anything about your portfolio, agreements, outlets, payments, or real estate in general.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              {SUGGESTION_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Card key={cat.label} className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-foreground/50" />
                      <span className="text-xs font-semibold text-foreground/60">
                        {cat.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {cat.questions.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="w-full text-left text-xs text-foreground/50 hover:text-foreground hover:bg-muted rounded px-2 py-1.5 transition-colors"
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
          /* Chat messages */
          <div className="max-w-3xl mx-auto py-4 space-y-4 px-2">
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
                      : "bg-card border border-border"
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
                <div className="bg-card border border-border rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/40" />
                    <span className="text-xs text-foreground/40">Analyzing your portfolio...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card p-4">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Grow AI anything about your portfolio..."
              className="flex-1"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} size="sm">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
          {messages.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {["Show overdue payments", "Portfolio health", "Expiring leases"].map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  disabled={loading}
                  className="text-[10px] text-foreground/40 hover:text-foreground/60 border border-border rounded-full px-3 py-1 whitespace-nowrap transition-colors disabled:opacity-50"
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
