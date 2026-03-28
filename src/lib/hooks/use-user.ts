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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

async function fetchFirstOrgId(): Promise<string | null> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
    // Build headers with auth token if available
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch {
      // Supabase may not be configured in demo mode — proceed without auth
    }
    const res = await fetch(`${apiUrl}/api/organizations?page_size=1`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        return data.items[0].id;
      }
    }
  } catch {
    // Silently handle — org lookup is best-effort for demo/fallback
  }
  return null;
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

    async function setDemoUser() {
      const orgId = await fetchFirstOrgId();

      // Read role/name from demo cookies (set by tiered login)
      const cookies = document.cookie.split(";").reduce((acc, c) => {
        const [k, v] = c.trim().split("=");
        if (k && v) acc[k] = decodeURIComponent(v);
        return acc;
      }, {} as Record<string, string>);

      const demoRole = (cookies["grospace-demo-role"] || "platform_admin") as UserData["role"];
      const demoName = cookies["grospace-demo-name"] || "Demo Admin";
      const demoTitle = cookies["grospace-demo-title"] || "";

      setUser({
        id: "demo-user",
        email: cookies["grospace-demo-role"] ? `${demoTitle.toLowerCase()}@grospace.in` : "admin@grospace.com",
        fullName: demoName,
        role: demoRole,
        orgId,
        initials: getInitials(demoName),
      });
      setLoading(false);
    }

    if (!isConfigured) {
      setDemoUser();
      return;
    }

    async function fetchUser() {
      try {
        const supabase = createClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          await setDemoUser();
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

        let orgId = profile?.org_id || null;
        if (!orgId) {
          orgId = await fetchFirstOrgId();
        }

        setUser({
          id: authUser.id,
          email: authUser.email || "",
          fullName,
          role: (profile?.role as UserData["role"]) || "org_member",
          orgId,
          initials: getInitials(fullName),
        });
      } catch {
        await setDemoUser();
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, []);

  return { user, loading };
}
