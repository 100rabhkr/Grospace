"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { Button } from "@/components/ui/button";
import { TopProgressBar } from "@/components/top-progress";
import { PageTransition } from "@/components/motion";
import { initGlobalErrorHandlers } from "@/lib/sentry";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isPublicPage = pathname?.startsWith("/showcase") || pathname?.startsWith("/leasebot");
  const isFullBleedPage = pathname === "/map" || pathname === "/ai-assistant";

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pendingJobs, setPendingJobs] = useState<{ id: string; filename: string; status: string }[]>([]);

  useEffect(() => {
    initGlobalErrorHandlers();
  }, []);

  useEffect(() => {
    async function checkPendingJobs() {
      try {
        const { listExtractionJobs } = await import("@/lib/api");
        const data = await listExtractionJobs({ status: "completed", seen: false, limit: 5 });
        setPendingJobs(data.jobs || []);
      } catch {
        // Non-blocking notification surface.
      }
    }

    checkPendingJobs();
  }, []);

  async function dismissJobs() {
    try {
      const api = await import("@/lib/api");
      for (const job of pendingJobs) {
        try {
          await api.markExtractionJobSeen(job.id);
        } catch {
          // Keep clearing the rest even if one mark fails.
        }
      }
    } catch {
      // Non-blocking banner dismissal.
    }

    setPendingJobs([]);
  }

  if (isAuthPage || isPublicPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <TopProgressBar />
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} />

        {pendingJobs.length > 0 && (
          <div className="border-b border-border bg-background px-6 py-3 lg:px-10">
            <div className="mx-auto flex w-full max-w-[1640px] items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    {pendingJobs.length} document{pendingJobs.length > 1 ? "s" : ""} ready for review
                  </p>
                  <p className="text-caption text-muted-foreground">
                    Extraction completed — jump into review and activation.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pendingJobs.slice(0, 2).map((job) => (
                  <Link key={job.id} href={`/agreements/upload?job_id=${job.id}`} onClick={dismissJobs}>
                    <Button size="sm" variant="outline" className="whitespace-nowrap max-w-[180px] truncate">
                      {((job as Record<string, unknown>).filename as string) || "Document"}
                    </Button>
                  </Link>
                ))}
                <Button size="sm" variant="ghost" onClick={dismissJobs}>
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        <main
          className={
            isFullBleedPage
              ? "relative flex-1 overflow-hidden bg-background"
              : "relative flex-1 overflow-y-auto bg-background px-5 pb-8 pt-5 lg:px-7"
          }
        >
          {isFullBleedPage ? (
            children
          ) : (
            <PageTransition key={pathname}>
              <div className="mx-auto w-full max-w-[1640px]">{children}</div>
            </PageTransition>
          )}
        </main>
      </div>

      <FloatingChat />
    </div>
  );
}

function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (pathname === "/ai-assistant") return null;

  async function send() {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const { smartChat } = await import("@/lib/api");
      const data = await smartChat(question);
      setMessages((prev) => [...prev, { role: "ai", content: data.answer }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: "Sorry, I couldn't process that right now. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Gro AI"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:bg-primary/90 hover:shadow-xl"
        >
          <Bot className="h-5 w-5" strokeWidth={2} />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[min(560px,calc(100vh-3rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border bg-background px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bot className="h-4 w-4" strokeWidth={2} />
              </div>
              <div>
                <p className="text-[15px] font-bold tracking-tight text-foreground">Gro AI</p>
                <p className="text-[11px] text-muted-foreground">Portfolio copilot</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" strokeWidth={2} />
                </div>
                <p className="text-sm font-semibold text-foreground">Ask Gro AI about your portfolio</p>
                <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">
                  Payments, expiries, outlet status, and document intelligence — all one message away.
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[84%] rounded-2xl bg-primary px-3.5 py-2.5 text-[13px] font-medium text-primary-foreground"
                      : "max-w-[84%] rounded-2xl border border-border bg-background px-3.5 py-2.5 text-[13px] text-foreground"
                  }
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-border bg-background px-3.5 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <div className="border-t border-border bg-background p-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/25">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask Gro AI..."
                className="flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={send}
                disabled={loading || !input.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
