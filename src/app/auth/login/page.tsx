"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, User, Shield, Settings, Users, Bot, Building2, FileText, TrendingUp, Sparkles } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [numOutlets, setNumOutlets] = useState("");
  const [industry, setIndustry] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  const goToApp = useCallback(() => {
    setTimeout(() => {
      window.location.href = redirectTo;
    }, 100);
  }, [redirectTo]);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const demoRes = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (demoRes.ok) {
        goToApp();
        return;
      }
    } catch {
      // Demo endpoint failed — fall through to Supabase
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || supabaseUrl === "your-supabase-project-url" || !supabaseKey) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              company,
              phone,
              city,
              num_outlets: numOutlets ? parseInt(numOutlets, 10) : undefined,
              industry: industry || undefined,
              role: role || undefined,
            },
          },
        });
        if (error) { setError(error.message); setLoading(false); return; }
        setSignupSuccess(true);
        setLoading(false);
        return;
      }

      goToApp();
    } catch {
      setError("Invalid email or password");
      setLoading(false);
    }
  }

  async function handleDemoLogin(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setLoading(true);
    setError("");

    try {
      const demoRes = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: demoEmail, password: demoPassword }),
      });
      if (demoRes.ok) {
        goToApp();
        return;
      }
    } catch {
      // Demo endpoint failed
    }

    setError("Demo login failed");
    setLoading(false);
  }

  const demoAccounts = [
    { label: "CEO", email: "ceo@grospace.in", password: "ceo2025", icon: User, desc: "Full access" },
    { label: "CFO", email: "cfo@grospace.in", password: "cfo2025", icon: Shield, desc: "Finance view" },
    { label: "Admin", email: "admin@grospace.in", password: "admin2025", icon: Settings, desc: "Admin panel" },
    { label: "Manager", email: "manager@grospace.in", password: "manager2025", icon: Users, desc: "Operations" },
  ];

  const features = [
    { icon: Bot, label: "AI Intelligence", desc: "AI-powered lease analysis" },
    { icon: Building2, label: "Portfolio Ops", desc: "Manage outlets & locations" },
    { icon: FileText, label: "Smart Extraction", desc: "Auto-extract from documents" },
    { icon: TrendingUp, label: "Deal Pipeline", desc: "Track deals end-to-end" },
  ];

  const inputClasses = "h-10 bg-transparent border-border rounded-lg text-sm placeholder:text-muted-foreground/50 focus:border-foreground/20 focus:ring-ring/10 transition-all duration-200";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden flex-col justify-between p-12 bg-foreground">
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }} />

        <div className="relative z-10">
          <div
            className="mb-16 transition-all duration-700 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(-10px)",
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Image src="/logo.png" alt="GroSpace" width={36} height={36} className="rounded-lg invert brightness-200" />
              <span className="text-xl font-semibold tracking-tight text-white">GroSpace</span>
            </div>
            <p className="text-white/35 text-sm tracking-wide">
              Your real estate, made smarter!
            </p>
          </div>

          <div
            className="transition-all duration-1000 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(20px)",
            }}
          >
            <h1 className="text-[42px] leading-[1.1] font-semibold text-white tracking-tight">
              Operate.
              <br />
              <span className="text-white/60">Optimize.</span>
              <br />
              Scale.
            </h1>
            <p className="mt-6 text-[14px] text-white/35 leading-relaxed max-w-[360px]">
              An AI-native platform helping F&amp;B and retail brands operate, optimize, and scale their real estate portfolios — from outlet leases, licenses to making smarter expansion decisions — all in one place.
            </p>
          </div>
        </div>

        <div className="relative z-10">
          <div
            className="grid grid-cols-2 gap-2.5 mb-8 transition-all duration-1000 delay-300 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(15px)",
            }}
          >
            {features.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.label}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300"
                >
                  <div className="w-7 h-7 rounded-md bg-white/[0.08] flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-white/50" />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-white/70">{feat.label}</p>
                    <p className="text-[10px] text-white/30">{feat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="flex items-center gap-4 text-white/20 text-[11px] transition-all duration-700 delay-500 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
            }}
          >
            <span>Powered by 360Labs</span>
            <span className="w-px h-3 bg-white/10" />
            <span>Trusted by India&apos;s leading F&B chains</span>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 sm:px-12 relative overflow-y-auto">
        <div className="w-full max-w-[380px] relative z-10 py-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <Image src="/logo.png" alt="GroSpace" width={32} height={32} className="rounded-lg" />
            <span className="text-lg font-semibold tracking-tight text-foreground">GroSpace</span>
          </div>

          {/* Try Demo -- always visible, shown first in login mode */}
          {mode === "login" && !signupSuccess && (
            <div className="mb-8">
              <div className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-background" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">Try Demo</p>
                  <span className="text-[10px] text-muted-foreground ml-auto">No signup needed</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {demoAccounts.map((acc) => {
                    const Icon = acc.icon;
                    return (
                      <button
                        key={acc.label}
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemoLogin(acc.email, acc.password)}
                        className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-foreground/15 hover:shadow-xs text-left transition-all duration-200 disabled:opacity-50"
                      >
                        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 group-hover:bg-foreground group-hover:text-background transition-all duration-200">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-[12px] font-medium text-foreground">{acc.label}</p>
                          <p className="text-[10px] text-muted-foreground">{acc.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {signupSuccess ? (
            <div className="rounded-xl border border-neutral-300 bg-neutral-50 p-8 text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100">
                <svg className="h-6 w-6 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Application received!</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Our team will review your details and activate your account within 24 hours. You&apos;ll receive an email once approved.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupSuccess(false);
                  setMode("login");
                }}
                className="mt-5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              {mode === "login" && (
                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 bg-background">or sign in with credentials</span>
                  </div>
                </div>
              )}

              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-foreground tracking-tight">
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {mode === "login"
                    ? "Enter your credentials to access your portfolio"
                    : "Get started with GroSpace"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === "signup" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-[12px] font-medium text-muted-foreground">Full Name</Label>
                      <Input id="fullName" type="text" placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className={inputClasses} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company" className="text-[12px] font-medium text-muted-foreground">Company</Label>
                      <Input id="company" type="text" placeholder="Company name" value={company} onChange={(e) => setCompany(e.target.value)} required className={inputClasses} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-[12px] font-medium text-muted-foreground">Phone</Label>
                        <Input id="phone" type="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClasses} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="city" className="text-[12px] font-medium text-muted-foreground">City</Label>
                        <Input id="city" type="text" placeholder="e.g. Mumbai" value={city} onChange={(e) => setCity(e.target.value)} required className={inputClasses} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="numOutlets" className="text-[12px] font-medium text-muted-foreground">No. of Outlets</Label>
                        <Input id="numOutlets" type="number" placeholder="e.g. 10" value={numOutlets} onChange={(e) => setNumOutlets(e.target.value)} required min="1" className={inputClasses} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="industry" className="text-[12px] font-medium text-muted-foreground">Industry</Label>
                        <select id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} required className={`${inputClasses} w-full border px-3`}>
                          <option value="">Select...</option>
                          <option value="fnb">F&B / QSR</option>
                          <option value="retail">Retail</option>
                          <option value="grocery">Grocery</option>
                          <option value="pharmacy">Pharmacy</option>
                          <option value="salon">Salon / Wellness</option>
                          <option value="education">Education</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="role" className="text-[12px] font-medium text-muted-foreground">Your Role</Label>
                      <select id="role" value={role} onChange={(e) => setRole(e.target.value)} required className={`${inputClasses} w-full border px-3`}>
                        <option value="">Select...</option>
                        <option value="founder">Founder / CEO</option>
                        <option value="cfo">CFO / Finance</option>
                        <option value="operations">Operations Head</option>
                        <option value="real_estate">Real Estate / Expansion</option>
                        <option value="manager">Store / Area Manager</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[12px] font-medium text-muted-foreground">Email</Label>
                  <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClasses} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-[12px] font-medium text-muted-foreground">Password</Label>
                    {mode === "login" && (
                      <button type="button" className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className={inputClasses} />
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 text-sm text-destructive bg-destructive/5 px-4 py-3 rounded-lg border border-destructive/10">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 rounded-lg font-medium text-sm group"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Sign In" : "Create Account"}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {mode === "login"
                    ? "Don\u2019t have an account? "
                    : "Already have an account? "}
                  <span className="font-medium text-foreground">
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </span>
                </button>
              </div>
            </>
          )}

          {/* Demo accounts after signup success */}
          {signupSuccess && (
            <div className="mt-6">
              <p className="text-xs font-medium text-muted-foreground text-center mb-3">Explore with a demo account</p>
              <div className="grid grid-cols-2 gap-2">
                {demoAccounts.map((acc) => {
                  const Icon = acc.icon;
                  return (
                    <button
                      key={acc.label}
                      type="button"
                      disabled={loading}
                      onClick={() => handleDemoLogin(acc.email, acc.password)}
                      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-foreground/15 hover:shadow-xs text-left transition-all duration-200 disabled:opacity-50"
                    >
                      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0 group-hover:bg-foreground group-hover:text-background transition-all duration-200">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-[12px] font-medium text-foreground">{acc.label}</p>
                        <p className="text-[10px] text-muted-foreground">{acc.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/40 text-center mt-8">
            Built by 360Labs
          </p>
        </div>
      </div>
    </div>
  );
}
