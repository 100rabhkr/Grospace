import { updateSession } from "@/lib/supabase/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isAuthApi = request.nextUrl.pathname.startsWith("/api/auth");
  const isLeasebotPage = request.nextUrl.pathname.startsWith("/leasebot");

  // Always check demo session cookie first — works regardless of Supabase config
  const demoSession = request.cookies.get("grospace-demo-session")?.value;

  if (demoSession === "authenticated") {
    // Demo user trying to visit auth pages — honor redirect param or go home
    if (isAuthPage) {
      const redirect = request.nextUrl.searchParams.get("redirect");
      const url = request.nextUrl.clone();
      url.pathname = redirect || "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // Demo user on any other page — allow through
    return NextResponse.next();
  }

  // Allow auth pages, auth API routes, and leasebot pages through
  if (isAuthPage || isAuthApi || isLeasebotPage) {
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
