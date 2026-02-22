import { updateSession } from "@/lib/supabase/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isAuthApi = request.nextUrl.pathname.startsWith("/api/auth");

  // Always check demo session cookie first — works regardless of Supabase config
  const demoSession = request.cookies.get("grospace-demo-session")?.value;

  if (demoSession === "authenticated") {
    // Demo user trying to visit auth pages — redirect to home
    if (isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    // Demo user on any other page — allow through
    return NextResponse.next();
  }

  // Allow auth pages and auth API routes through (login page, demo endpoint, etc.)
  if (isAuthPage || isAuthApi) {
    return NextResponse.next();
  }

  // If Supabase is configured, use Supabase session for non-demo users
  const supabaseConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your-supabase-project-url" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseConfigured) {
    return await updateSession(request);
  }

  // No demo session and no Supabase — redirect to login
  const url = request.nextUrl.clone();
  url.pathname = "/auth/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
