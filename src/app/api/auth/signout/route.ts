import { NextResponse } from "next/server";

export async function POST() {
  // If Supabase is configured, sign out via Supabase
  const supabaseConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your-supabase-project-url" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseConfigured) {
    try {
      const { createServerSupabaseClient } = await import("@/lib/supabase/server");
      const supabase = createServerSupabaseClient();
      await supabase.auth.signOut();
    } catch {
      // Supabase not available, continue with cookie clearing
    }
  }

  // Best-effort cleanup of any lingering demo-session cookies from the
  // legacy auth flow. The real /api/auth/demo endpoint has been removed,
  // but stale browser state can still have these cookies around.
  const response = NextResponse.json({ success: true });
  for (const name of ["grospace-demo-session", "grospace-demo-role", "grospace-demo-name"]) {
    response.cookies.set(name, "", {
      httpOnly: name === "grospace-demo-session",
      path: "/",
      maxAge: 0,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
