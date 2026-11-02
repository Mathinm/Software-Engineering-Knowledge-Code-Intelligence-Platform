import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toResponse, ApiError } from "@/lib/api";
import { loginRetryAfter, verifyLogin } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(150),
  password: z.string().min(1, "Password is required.").max(200),
});

// POST /api/auth/login — check email + password, set an httpOnly JWT cookie.
export async function POST(req: NextRequest) {
  try {
    const { email, password } = schema.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const wait = loginRetryAfter(ip, email);
    if (wait > 0) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }
    const user = await verifyLogin(email, password, ip);
    // Same message for unknown email and wrong password.
    if (!user) throw new ApiError(401, "Invalid email or password.");

    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, await signSession(user), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return res;
  } catch (e) {
    return toResponse(e);
  }
}
