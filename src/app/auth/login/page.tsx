"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight, User, Shield, Settings, Users } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
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

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#132337] relative overflow-hidden flex-col justify-between p-12">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <Image src="/logo.png" alt="GroSpace" width={36} height={36} className="rounded-lg" />
            <span className="text-xl font-semibold tracking-tight text-white">GroSpace</span>
          </div>

          <div
            className="transition-all duration-700 ease-out"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
            }}
          >
            <h1 className="text-[40px] leading-[1.1] font-bold text-white tracking-tight">
              Real Estate
              <br />
              Intelligence Platform
            </h1>
            <p className="mt-5 text-[15px] text-white/50 leading-relaxed max-w-sm">
              GroSpace AI-powered lease intelligence for retail and F&B chains — extract, track, and manage every agreement, outlet, and obligation from a single platform.
            </p>
          </div>
        </div>

        <div
          className="relative z-10 transition-all duration-700 delay-200 ease-out"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <div className="flex items-center gap-6 text-white/30 text-xs">
            <span>Trusted by India&apos;s leading F&B chains</span>
            <span className="w-px h-3 bg-white/20" />
            <span>360Labs</span>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 sm:px-12 bg-slate-50/30">
        <div
          className="w-full max-w-[380px] transition-all duration-500 ease-out"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(10px)",
          }}
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <Image src="/logo.png" alt="GroSpace" width={32} height={32} />
            <span className="text-lg font-semibold tracking-tight text-[#132337]">GroSpace</span>
          </div>

          {signupSuccess ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#132337]">Thank you!</h3>
              <p className="mt-2 text-sm text-slate-500">
                Your account is pending approval. We&apos;ll notify you once your access is granted.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSignupSuccess(false);
                  setMode("login");
                }}
                className="mt-5 text-sm text-slate-400 hover:text-[#132337] transition-colors duration-150"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-semibold text-[#132337] tracking-tight">
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
                <p className="text-sm text-slate-400 mt-1.5">
                  {mode === "login"
                    ? "Enter your credentials to continue"
                    : "Get started with GroSpace"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {mode === "signup" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Name</Label>
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="Your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        className="h-11 bg-white border-slate-200 rounded-lg text-sm placeholder:text-slate-300 focus:border-[#132337] focus:ring-[#132337]/10 transition-all duration-150"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="company" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Company</Label>
                      <Input
                        id="company"
                        type="text"
                        placeholder="Company name"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        required
                        className="h-11 bg-white border-slate-200 rounded-lg text-sm placeholder:text-slate-300 focus:border-[#132337] focus:ring-[#132337]/10 transition-all duration-150"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-11 bg-white border-slate-200 rounded-lg text-sm placeholder:text-slate-300 focus:border-[#132337] focus:ring-[#132337]/10 transition-all duration-150"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 bg-white border-slate-200 rounded-lg text-sm placeholder:text-slate-300 focus:border-[#132337] focus:ring-[#132337]/10 transition-all duration-150"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-slate-500 uppercase tracking-wider">Password</Label>
                    {mode === "login" && (
                      <button type="button" className="text-[11px] text-slate-400 hover:text-[#132337] transition-colors">
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
                    className="h-11 bg-white border-slate-200 rounded-lg text-sm placeholder:text-slate-300 focus:border-[#132337] focus:ring-[#132337]/10 transition-all duration-150"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3.5 py-2.5 rounded-lg border border-red-100">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-[#132337] hover:bg-[#1a2f47] text-white rounded-lg font-medium text-sm shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-150 group"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "login" ? "Sign In" : "Create Account"}
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>

              {mode === "login" && (
                <div className="mt-8">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-slate-200/80" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-slate-50/30 px-3 text-[10px] font-medium uppercase tracking-widest text-slate-300">Demo Access</span>
                    </div>
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
                          className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-slate-200/80 bg-white hover:border-[#132337]/30 hover:shadow-sm text-left transition-all duration-150 disabled:opacity-50"
                        >
                          <div className="w-7 h-7 rounded-md bg-slate-100 group-hover:bg-[#132337]/5 flex items-center justify-center transition-colors duration-150">
                            <Icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#132337] transition-colors duration-150" />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-[#132337]">{acc.label}</p>
                            <p className="text-[10px] text-slate-400">{acc.desc}</p>
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
                  className="text-sm text-slate-400 hover:text-[#132337] transition-colors duration-150"
                >
                  {mode === "login"
                    ? "Don\u2019t have an account? Sign up"
                    : "Already have an account? Sign in"}
                </button>
              </div>
            </>
          )}

          <p className="text-[10px] text-slate-300 text-center mt-8 tracking-wide">
            Built by 360Labs
          </p>
        </div>
      </div>
    </div>
  );
}
