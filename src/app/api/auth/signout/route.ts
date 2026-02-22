import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const redirectUrl = new URL("/auth/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

  // If Supabase is configured, sign out via Supabase
  const supabaseConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your-supabase-project-url";

  if (supabaseConfigured) {
    const supabase = createServerSupabaseClient();
    await supabase.auth.signOut();
  }

  // Always clear the demo session cookie
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set("grospace-demo-session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });

  return response;
}
