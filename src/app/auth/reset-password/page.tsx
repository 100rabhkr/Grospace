"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import { changeOwnPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isForced = searchParams.get("force") === "1";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Confirm the user is actually logged in before showing the form.
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          router.push("/auth/login?redirect=/auth/reset-password");
          return;
        }
        setUserEmail(data.user.email || null);
      } catch {
        router.push("/auth/login");
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await changeOwnPassword(newPassword);
      // Success — route to dashboard (or stay put if not forced)
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
      setLoading(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-[440px]">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
              <Logo className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">GroSpace</p>
              <p className="text-[13px] font-semibold text-foreground leading-none mt-0.5">Secure your account</p>
            </div>
          </div>

          {isForced ? (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <KeyRound className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-[12px] text-amber-900 leading-relaxed">
                <strong>Set your permanent password.</strong> You logged in with a temporary
                password we sent in your invitation email. Choose a new one now to
                continue to the app.
              </div>
            </div>
          ) : (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <ShieldCheck className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
              <div className="text-[12px] text-muted-foreground leading-relaxed">
                Change the password you use to sign in to GroSpace.
              </div>
            </div>
          )}

          {userEmail && (
            <div className="mb-4 rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Account</p>
              <p className="text-[13px] font-mono text-foreground mt-0.5">{userEmail}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-password" className="text-[12px] font-medium">
                New password
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-[12px] font-medium">
                Confirm new password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Type it again"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  {isForced ? "Set password and continue" : "Update password"}
                </>
              )}
            </Button>
          </form>
        </div>

        {!isForced && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-[12px] text-muted-foreground hover:text-foreground"
            >
              ← Back to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
