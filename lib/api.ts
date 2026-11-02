import "server-only";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import { isRevoked } from "./revocation";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session";

/** An error that is safe to show to the client. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const forbidden = (msg = "You do not have permission to do this.") => new ApiError(403, msg);
export const notFound = (what = "Record") => new ApiError(404, `${what} not found.`);

/** Map Postgres SQLSTATE codes to HTTP responses without leaking SQL. */
function pgToApiError(e: { code?: string; message?: string; constraint?: string }): ApiError | null {
  switch (e.code) {
    case "23505": return new ApiError(409, "A record with these values already exists.");
    case "23503": return new ApiError(409, "This change conflicts with related records (foreign key).");
    case "23514": return new ApiError(400, "A value is not allowed by a database rule (check constraint).");
    case "22P02": return new ApiError(400, "A value has the wrong format.");
    case "P0001": return new ApiError(400, e.message ?? "Rejected by a database rule.");
    default: return null;
  }
}

function toResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of e.issues) fields[i.path.join(".") || "_"] ??= i.message;
    return NextResponse.json({ error: "Invalid input.", fields }, { status: 400 });
  }
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const mapped = pgToApiError(e as { code?: string });
  if (mapped) return toResponse(mapped);
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}

/** Read the signed-in user from the session cookie (server components + routes). */
export async function currentUser(): Promise<SessionUser | null> {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s || (await isRevoked(s.jti))) return null;
  return { id: s.id, name: s.name, email: s.email, role: s.role };
}

type Ctx<P> = { req: NextRequest; params: P; user: SessionUser };

/**
 * Wrap a route handler: requires a session (and optionally the admin role),
 * catches every error and turns it into clean JSON.
 */
export function route<P = Record<string, string>>(
  fn: (ctx: Ctx<P>) => Promise<unknown>,
  opts: { admin?: boolean } = {},
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const user = await currentUser();
      if (!user) throw new ApiError(401, "Please sign in.");
      if (opts.admin && user.role !== "admin") throw forbidden("Admins only.");
      const out = await fn({ req, params: await ctx.params, user });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return toResponse(e);
    }
  };
}

export { toResponse };

export const idSchema = z.coerce.number().int().positive().max(2147483647);
export const parseId = (v: unknown) => idSchema.parse(v);

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  return schema.parse(await req.json());
}

/** Parse ?query params with a zod schema (empty strings are treated as missing). */
export function searchParams<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (v !== "") obj[k] = v;
  });
  return schema.parse(obj);
}

export const pageSchema = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
