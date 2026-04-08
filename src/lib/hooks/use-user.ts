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

type DemoCookieData = {
  demoRole: UserData["role"];
  demoName: string;
  demoTitle: string;
  hasDemoRoleCookie: boolean;
};

let firstOrgIdCache: string | null | undefined;
let firstOrgIdPromise: Promise<string | null> | null = null;
const USER_LOOKUP_TIMEOUT_MS = 8000;

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallbackMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(fallbackMessage)), ms);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function fetchFirstOrgId(): Promise<string | null> {
  if (firstOrgIdCache !== undefined) {
    return firstOrgIdCache;
  }
  if (firstOrgIdPromise) {
    return firstOrgIdPromise;
  }

  firstOrgIdPromise = (async () => {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    // Build headers with auth token if available
    const headers: Record<string, string> = {};
    try {
      const supabase = createClient();
      const { data: { session } } = await withTimeout(
        supabase.auth.getSession(),
        USER_LOOKUP_TIMEOUT_MS,
        "Session lookup timed out"
      );
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch {
      // Supabase may not be configured in demo mode — proceed without auth
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), USER_LOOKUP_TIMEOUT_MS);
    const res = await fetch(`${apiUrl}/api/organizations?page_size=1`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
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
  })();

  try {
    firstOrgIdCache = await firstOrgIdPromise;
    return firstOrgIdCache;
  } finally {
    firstOrgIdPromise = null;
  }
}

function readDemoCookies(): DemoCookieData {
  const cookies = document.cookie.split(";").reduce((acc, c) => {
    const [k, v] = c.trim().split("=");
    if (k && v) acc[k] = decodeURIComponent(v);
    return acc;
  }, {} as Record<string, string>);

  return {
    demoRole: (cookies["grospace-demo-role"] || "platform_admin") as UserData["role"],
    demoName: cookies["grospace-demo-name"] || "Demo Admin",
    demoTitle: cookies["grospace-demo-title"] || "",
    hasDemoRoleCookie: Boolean(cookies["grospace-demo-role"]),
  };
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

    function hydrateOrgId(userData: UserData) {
      if (userData.orgId) {
        return;
      }

      void fetchFirstOrgId().then((orgId) => {
        setUser((prev) => {
          if (!prev || prev.id !== userData.id) {
            return prev;
          }
          return { ...prev, orgId };
        });
      });
    }

    function applyResolvedUser(userData: UserData) {
      setUser(userData);
      setLoading(false);
      hydrateOrgId(userData);
    }

    function setDemoUser() {
      const { demoRole, demoName, demoTitle, hasDemoRoleCookie } = readDemoCookies();

      applyResolvedUser({
        id: "demo-user",
        email:
          hasDemoRoleCookie && demoTitle
            ? `${demoTitle.toLowerCase().replace(/\s+/g, ".")}@grospace.in`
            : "admin@grospace.com",
        fullName: demoName,
        role: demoRole,
        orgId: null,
        initials: getInitials(demoName),
      });
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
        } = await withTimeout(
          supabase.auth.getUser(),
          USER_LOOKUP_TIMEOUT_MS,
          "User lookup timed out"
        );

        if (!authUser) {
          setDemoUser();
          return;
        }

        let profile:
          | {
              full_name?: string | null;
              role?: UserData["role"] | null;
              org_id?: string | null;
            }
          | null = null;

        try {
          const { data } = await withTimeout<{
            data:
              | {
                  full_name?: string | null;
                  role?: UserData["role"] | null;
                  org_id?: string | null;
                }
              | null;
          }>(
            supabase
              .from("profiles")
              .select("full_name, role, org_id")
              .eq("id", authUser.id)
              .single(),
            USER_LOOKUP_TIMEOUT_MS,
            "Profile lookup timed out"
          );
          profile = data;
        } catch {
          profile = null;
        }

        const fullName =
          profile?.full_name ||
          authUser.email?.split("@")[0] ||
          "User";

        applyResolvedUser({
          id: authUser.id,
          email: authUser.email || "",
          fullName,
          role: (profile?.role as UserData["role"]) || "org_member",
          orgId: profile?.org_id || null,
          initials: getInitials(fullName),
        });
      } catch {
        setDemoUser();
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, []);

  return { user, loading };
}
