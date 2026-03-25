import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        remove(name: string, options: any) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPendingPage = request.nextUrl.pathname === "/auth/pending-approval";

  // Redirect unauthenticated users to login (except auth pages)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/auth") &&
    !request.nextUrl.pathname.startsWith("/leasebot")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // For authenticated users, check if they are approved (have org_id or are platform_admin)
  if (user && !isPendingPage && !request.nextUrl.pathname.startsWith("/api/auth")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, org_id")
      .eq("id", user.id)
      .single();

    const isApproved = profile?.org_id || profile?.role === "platform_admin";

    if (!isApproved) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/pending-approval";
      return NextResponse.redirect(url);
    }

    // Approved user trying to visit auth pages — honor redirect param or go home
    if (request.nextUrl.pathname.startsWith("/auth")) {
      const redirect = request.nextUrl.searchParams.get("redirect");
      const url = request.nextUrl.clone();
      url.pathname = redirect || "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
