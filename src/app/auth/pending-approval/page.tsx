"use client";

import { createClient } from "@/lib/supabase/client";
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function PendingApprovalPage() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <div className="min-h-screen bg-[#132337] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
          <Clock className="h-8 w-8 text-amber-600" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-[#132337]">Account Pending Approval</h1>
          <p className="text-sm text-neutral-500 mt-2 leading-relaxed">
            Your account has been created successfully. An administrator needs to
            approve your request before you can access the platform.
          </p>
        </div>

        <div className="bg-[#f4f6f9] rounded-lg p-4">
          <p className="text-xs text-neutral-500">
            You will be able to log in once your account is approved and assigned to an organization.
          </p>
        </div>

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
