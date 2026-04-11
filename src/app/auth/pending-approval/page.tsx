"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Clock, LogOut, Building2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { selfServeCreateOrganization } from "@/lib/api";

export default function PendingApprovalPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"waiting" | "self-serve">("waiting");
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  async function handleCreateOrg() {
    if (!orgName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await selfServeCreateOrganization(orgName.trim());
      // Refresh the session so middleware picks up the new org_id
      const supabase = createClient();
      await supabase.auth.refreshSession();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
      setCreating(false);
    }
  }

  if (mode === "self-serve") {
    return (
      <div className="min-h-screen bg-foreground flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>

          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">Create Your Organization</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Set up your workspace. You&apos;ll be the admin and can invite
              team members, add brands, and create outlets right away.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Organization name</label>
            <Input
              placeholder="e.g. Good Flippin&apos; Burgers Pvt Ltd"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={creating}
              autoFocus
            />
            {error && (
              <p className="text-xs text-rose-600 mt-2">{error}</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setMode("waiting")}
              disabled={creating}
            >
              Back
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleCreateOrg}
              disabled={creating || !orgName.trim()}
            >
              <Rocket className="h-4 w-4" />
              {creating ? "Creating…" : "Create & Continue"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-foreground flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
          <Clock className="h-8 w-8 text-amber-600" />
        </div>

        <div>
          <h1 className="text-xl font-semibold text-foreground">Account Pending Approval</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Your account is created. If you&apos;re joining an existing
            organization, an admin will approve and assign you shortly.
          </p>
        </div>

        <div className="bg-muted rounded-lg p-4 text-left">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Don&apos;t have an organization yet?</strong>
            <br />
            You can create your own workspace right now — you&apos;ll be the
            admin and skip the approval queue.
          </p>
        </div>

        <Button
          className="w-full gap-2"
          onClick={() => setMode("self-serve")}
        >
          <Building2 className="h-4 w-4" />
          Create Your Own Organization
        </Button>

        <Button
          variant="outline"
          className="gap-2 w-full"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
