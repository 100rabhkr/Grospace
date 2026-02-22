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

  // Always clear the demo session cookie
  const response = NextResponse.json({ success: true });
  response.cookies.set("grospace-demo-session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
