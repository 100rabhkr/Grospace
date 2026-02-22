import { updateSession } from "@/lib/supabase/middleware";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const supabaseConfigured =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "your-supabase-project-url";

  // Prototype mode: Supabase is NOT configured — use demo session cookie
  if (!supabaseConfigured) {
    const demoSession = request.cookies.get("grospace-demo-session")?.value;
    const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
    const isAuthApi = request.nextUrl.pathname.startsWith("/api/auth");

    // Authenticated demo user trying to visit auth pages — redirect to home
    if (demoSession === "authenticated" && isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // Authenticated demo user or auth-related path — allow through
    if (demoSession === "authenticated" || isAuthPage || isAuthApi) {
      return NextResponse.next();
    }

    // Unauthenticated user on a protected path — redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Production mode: Supabase is configured — use Supabase session
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
