import { NextRequest, NextResponse } from "next/server";

// Role-tiered demo logins — each persona has a DIFFERENT permission set
// (see backend/core/config.py::ROLE_PERMISSIONS for the exact matrix).
const DEMO_ACCOUNTS: Record<string, { password: string; role: string; title: string; fullName: string }> = {
  // CEO — full access (everything, including org + platform settings)
  "ceo@grospace.in":      { password: "ceo2025",       role: "platform_admin", title: "CEO",     fullName: "Srabhjot Singh" },
  // CFO — read-only financial view (sees all data + reports, cannot edit)
  "cfo@grospace.in":      { password: "cfo2025",       role: "finance_viewer", title: "CFO",     fullName: "Rahul Mehta" },
  // Admin — full CRUD on org resources + team management
  "admin@grospace.in":    { password: "admin2025",     role: "org_admin",      title: "Admin",   fullName: "Aryan Budukh" },
  // Manager — operations (view + acknowledge alerts + mark payments paid)
  "manager@grospace.in":  { password: "manager2025",   role: "org_member",     title: "Manager", fullName: "Priya Sharma" },
  // Legacy demo login
  "admin@grospace.com":   { password: "admin2025",     role: "platform_admin", title: "Admin",   fullName: "Demo Admin" },
};

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const account = DEMO_ACCOUNTS[email?.toLowerCase()];

    if (account && password === account.password) {
      const response = NextResponse.json({
        success: true,
        role: account.role,
        title: account.title,
        fullName: account.fullName,
      });
      // Store role info in cookie so useUser can read it
      response.cookies.set("grospace-demo-session", "authenticated", {
        httpOnly: true,
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      response.cookies.set("grospace-demo-role", account.role, {
        path: "/",
        maxAge: 60 * 60 * 24,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      response.cookies.set("grospace-demo-name", account.fullName, {
        path: "/",
        maxAge: 60 * 60 * 24,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      response.cookies.set("grospace-demo-title", account.title, {
        path: "/",
        maxAge: 60 * 60 * 24,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return response;
    }

    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }
}

export async function GET() {
  // Return available demo accounts (without passwords) for the login page
  const accounts = Object.entries(DEMO_ACCOUNTS)
    .filter(([email]) => email !== "admin@grospace.com") // hide legacy
    .map(([email, info]) => ({
      email,
      title: info.title,
      role: info.role,
      fullName: info.fullName,
    }));
  return NextResponse.json({ accounts });
}
