"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type UserData = {
  id: string;
  email: string;
  fullName: string;
  role: "platform_admin" | "org_admin" | "org_member";
  orgId: string | null;
  initials: string;
};

const DEMO_USER: UserData = {
  id: "demo-user",
  email: "admin@grospace.com",
  fullName: "Demo Admin",
  role: "platform_admin",
  orgId: null,
  initials: "DA",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function useUser() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isConfigured =
      supabaseUrl &&
      supabaseUrl !== "your-supabase-project-url" &&
      supabaseUrl.startsWith("http");

    if (!isConfigured) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    async function fetchUser() {
      try {
        const supabase = createClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          setUser(DEMO_USER);
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, role, org_id")
          .eq("id", authUser.id)
          .single();

        const fullName =
          profile?.full_name ||
          authUser.email?.split("@")[0] ||
          "User";

        setUser({
          id: authUser.id,
          email: authUser.email || "",
          fullName,
          role: (profile?.role as UserData["role"]) || "org_member",
          orgId: profile?.org_id || null,
          initials: getInitials(fullName),
        });
      } catch {
        setUser(DEMO_USER);
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, []);

  return { user, loading };
}
