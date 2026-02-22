import { NextRequest, NextResponse } from "next/server";

const DEMO_EMAIL = "admin@grospace.com";
const DEMO_PASSWORD = "admin2025";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      const response = NextResponse.json({ success: true });
      response.cookies.set("grospace-demo-session", "authenticated", {
        httpOnly: true,
        path: "/",
        maxAge: 60 * 60 * 24, // 24 hours
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
