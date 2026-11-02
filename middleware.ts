import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout"];
const ADMIN_ONLY = ["/audit", "/api/audit"];

// Gate every page and API route. Route handlers re-check roles themselves too.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  // /login is always reachable. (The edge middleware only checks the signature; a revoked token
  // would otherwise bounce between /login and the app layout. The login page asks /api/auth/me instead.)
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (!user) {
    if (isApi) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (user.role !== "admin" && ADMIN_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (isApi) return NextResponse.json({ error: "Admins only." }, { status: 403 });
    return NextResponse.redirect(new URL("/?denied=audit", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:png|svg|ico|jpg)$).*)"],
};
