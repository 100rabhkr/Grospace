"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, User, Shield, Settings, Users, Bot, Building2, FileText, TrendingUp } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [numOutlets, setNumOutlets] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [mounted, setMounted] = useState(false);

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
        window.location.href = "/";
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
            },
          },
        });
        if (error) { setError(error.message); setLoading(false); return; }
        setSignupSuccess(true);
        setLoading(false);
        return;
      }

      window.location.href = "/";
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
        window.location.href = "/";
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
    { icon: Bot, label: "GroBot", desc: "AI-powered lease intelligence" },
    { icon: Building2, label: "Portfolio Ops", desc: "Manage outlets & locations" },
    { icon: FileText, label: "Smart Extraction", desc: "Auto-extract from documents" },
    { icon: TrendingUp, label: "Deal Pipeline", desc: "Track deals end-to-end" },
  ];

  return (
    <div className="min-h-screen flex bg-[#f4f6f9]">
      {/* Left panel — premium branding */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden flex-col justify-between p-12"
        style={{
          background: "linear-gradient(135deg, #0c1829 0%, #132337 40%, #1a2d42 70%, #132337 100%)",
        }}
      >
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute w-[600px] h-[600px] rounded-full opacity-[0.07]"
            style={{
              background: "radial-gradient(circle, #ffffff 0%, transparent 70%)",
              top: "-15%",
              right: "-10%",
              animation: mounted ? "float1 20s ease-in-out infinite" : "none",
            }}
          />
          <div
            className="absolute w-[500px] h-[500px] rounded-full opacity-[0.05]"
            style={{
              background: "radial-gradient(circle, #ffffff 0%, transparent 70%)",
              bottom: "-10%",
              left: "-5%",
              animation: mounted ? "float2 25s ease-in-out infinite" : "none",
            }}
          />
          <div
            className="absolute w-[300px] h-[300px] rounded-full opacity-[0.04]"
            style={{
              background: "radial-gradient(circle, #ffffff 0%, transparent 70%)",
              top: "40%",
              left: "30%",
              animation: mounted ? "float3 18s ease-in-out infinite" : "none",
            }}
          />
        </div>

        {/* Dot grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }} />

        <div className="relative z-10">
          {/* Logo + tagline */}
          <div
            className="mb-16 transition-all duration-700 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(-10px)",
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <Image src="/logo.png" alt="GroSpace" width={40} height={40} className="rounded-xl shadow-lg shadow-white/5" />
              <span className="text-2xl font-bold tracking-tight text-white">GroSpace</span>
            </div>
            <p className="text-white/40 text-sm font-medium tracking-wide">
              AI-Native Real Estate Platform
            </p>
          </div>

          {/* Hero text */}
          <div
            className="transition-all duration-1000 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(20px)",
            }}
          >
            <h1 className="text-[44px] leading-[1.08] font-bold text-white tracking-tight">
              Operate.
              <br />
              <span className="text-white/80">
                Optimize.
              </span>
              <br />
              Scale.
            </h1>
            <p className="mt-6 text-[15px] text-white/40 leading-relaxed max-w-[380px]">
              Helping F&B and retail brands manage their real estate portfolios — from outlet leases and licenses to smarter expansion decisions — all in one place.
            </p>
          </div>
        </div>

        {/* Feature cards */}
        <div className="relative z-10">
          <div
            className="grid grid-cols-2 gap-3 mb-8 transition-all duration-1000 delay-300 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(15px)",
            }}
          >
            {features.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.label}
                  className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-[#fafbfd]/[0.03] hover:bg-[#fafbfd]/[0.06] hover:border-white/[0.12] transition-all duration-300"
                  style={{
                    animationDelay: `${i * 100}ms`,
                  }}
                >
                  <div className="w-8 h-8 rounded-lg bg-[#fafbfd]/[0.08] flex items-center justify-center flex-shrink-0 group-hover:bg-[#fafbfd]/[0.12] transition-all duration-300">
                    <Icon className="w-3.5 h-3.5 text-white/60" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white/80">{feat.label}</p>
                    <p className="text-[10px] text-white/30">{feat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="flex items-center gap-6 text-white/20 text-xs transition-all duration-700 delay-500 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(8px)",
            }}
          >
            <span>Powered by 360Labs</span>
            <span className="w-px h-3 bg-[#fafbfd]/10" />
            <span>Trusted by India&apos;s leading F&B chains</span>
          </div>
        </div>

        {/* CSS animations */}
        <style>{`
          @keyframes float1 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(30px, -40px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.95); }
          }
          @keyframes float2 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(-30px, 30px) scale(1.05); }
            66% { transform: translate(40px, -20px) scale(0.9); }
          }
          @keyframes float3 {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(20px, -30px) scale(1.15); }
          }
        `}</style>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 sm:px-12 relative overflow-y-auto"
        style={{ background: "linear-gradient(180deg, #f8f9fb 0%, #f4f6f9 50%, #f0f2f6 100%)" }}
      >
        {/* Subtle pattern */}
        <div className="absolute inset-0 opacity-[0.3]" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #e2e8f0 0.5px, transparent 0)",
          backgroundSize: "24px 24px",
        }} />

        <div
          className="w-full max-w-[400px] relative z-10 py-8"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <Image src="/logo.png" alt="GroSpace" width={36} height={36} className="rounded-xl" />
            <span className="text-xl font-bold tracking-tight text-[#132337]">GroSpace</span>
          </div>

          {signupSuccess ? (
            <div className="rounded-2xl border border-green-200 bg-green-50/80 backdrop-blur-sm p-8 text-center shadow-sm">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 shadow-sm">
                <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-[#132337]">Thank you!</h3>
              <p className="mt-3 text-sm text-[#132337]/50 leading-relaxed">
                Your account is pending approval. We&apos;ll notify you once your access is granted.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupSuccess(false);
                  setMode("login");
                }}
                className="mt-6 text-sm text-[#132337]/40 hover:text-[#132337] transition-colors duration-200"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-[28px] font-bold text-[#132337] tracking-tight">
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-sm text-[#132337]/40 mt-2">
                  {mode === "login"
                    ? "Enter your credentials to access your portfolio"
                    : "Get started with GroSpace"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-[11px] font-semibold text-[#132337]/50 uppercase tracking-wider">Full Name</Label>
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="Your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="h-12 bg-[#fafbfd] border-[#e4e8ef] rounded-xl text-sm placeholder:text-[#132337]/30 focus:border-[#132337]/40 focus:ring-[#132337]/10 transition-all duration-200 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company" className="text-[11px] font-semibold text-[#132337]/50 uppercase tracking-wider">Company</Label>
                      <Input
                        id="company"
                        type="text"
                        placeholder="Company name"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        required
                        className="h-12 bg-[#fafbfd] border-[#e4e8ef] rounded-xl text-sm placeholder:text-[#132337]/30 focus:border-[#132337]/40 focus:ring-[#132337]/10 transition-all duration-200 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-[11px] font-semibold text-[#132337]/50 uppercase tracking-wider">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-12 bg-[#fafbfd] border-[#e4e8ef] rounded-xl text-sm placeholder:text-[#132337]/30 focus:border-[#132337]/40 focus:ring-[#132337]/10 transition-all duration-200 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="city" className="text-[11px] font-semibold text-[#132337]/50 uppercase tracking-wider">City</Label>
                      <Input
                        id="city"
                        type="text"
                        placeholder="e.g. Mumbai"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        className="h-12 bg-[#fafbfd] border-[#e4e8ef] rounded-xl text-sm placeholder:text-[#132337]/30 focus:border-[#132337]/40 focus:ring-[#132337]/10 transition-all duration-200 shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="numOutlets" className="text-[11px] font-semibold text-[#132337]/50 uppercase tracking-wider">No. of Outlets</Label>
                      <Input
                        id="numOutlets"
                        type="number"
                        placeholder="e.g. 10"
                        value={numOutlets}
                        onChange={(e) => setNumOutlets(e.target.value)}
                        required
                        min="1"
                        className="h-12 bg-[#fafbfd] border-[#e4e8ef] rounded-xl text-sm placeholder:text-[#132337]/30 focus:border-[#132337]/40 focus:ring-[#132337]/10 transition-all duration-200 shadow-sm"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[11px] font-semibold text-[#132337]/50 uppercase tracking-wider">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12 bg-[#fafbfd] border-[#e4e8ef] rounded-xl text-sm placeholder:text-[#132337]/30 focus:border-[#132337]/40 focus:ring-[#132337]/10 transition-all duration-200 shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-[11px] font-semibold text-[#132337]/50 uppercase tracking-wider">Password</Label>
                    {mode === "login" && (
                      <button type="button" className="text-[11px] text-[#132337]/50 hover:text-[#132337] transition-colors font-medium">
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-12 bg-[#fafbfd] border-[#e4e8ef] rounded-xl text-sm placeholder:text-[#132337]/30 focus:border-[#132337]/40 focus:ring-[#132337]/10 transition-all duration-200 shadow-sm"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 text-sm text-red-600 bg-red-50/80 backdrop-blur-sm px-4 py-3 rounded-xl border border-red-100 shadow-sm">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 bg-[#132337] hover:bg-[#1a2d42] text-white rounded-xl font-semibold text-sm shadow-lg shadow-[#132337]/20 hover:shadow-xl active:scale-[0.98] transition-all duration-200 group"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Sign In" : "Create Account"}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </form>

              {mode === "login" && (
                <div className="mt-8">
                  <div className="relative mb-5">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-[#e4e8ef]" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="px-4 text-[10px] font-semibold uppercase tracking-widest text-[#132337]/30" style={{ background: "linear-gradient(180deg, #f8f9fb, #f4f6f9)" }}>Demo Access</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {demoAccounts.map((acc) => {
                      const Icon = acc.icon;
                      return (
                        <button
                          key={acc.label}
                          type="button"
                          disabled={loading}
                          onClick={() => handleDemoLogin(acc.email, acc.password)}
                          className="group flex items-center gap-3 px-3.5 py-3 rounded-xl border border-[#e4e8ef] bg-[#fafbfd]/80 backdrop-blur-sm hover:border-[#132337]/20 hover:bg-[#fafbfd] hover:shadow-sm text-left transition-all duration-200 disabled:opacity-50"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#f4f6f9] group-hover:bg-[#e4e8ef]/60 flex items-center justify-center transition-colors duration-200">
                            <Icon className="w-3.5 h-3.5 text-[#132337]/40 group-hover:text-[#132337] transition-colors duration-200" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-[#132337]">{acc.label}</p>
                            <p className="text-[10px] text-[#132337]/40">{acc.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setMode(mode === "login" ? "signup" : "login")}
                  className="text-sm text-[#132337]/40 hover:text-[#132337] transition-colors duration-200"
                >
                  {mode === "login"
                    ? "Don\u2019t have an account? "
                    : "Already have an account? "}
                  <span className="font-semibold text-[#132337]">
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </span>
                </button>
              </div>
            </>
          )}

          <p className="text-[10px] text-[#132337]/30 text-center mt-8 tracking-wide">
            Built with care by 360Labs
          </p>
        </div>
      </div>
    </div>
  );
}
