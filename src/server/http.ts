import "server-only";
import { after, NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { createDb, type DB } from "@/db/client";
import { env } from "@/lib/env";
import { ApiError, type ApiErrorBody } from "@/lib/errors";

const MAX_BODY_BYTES = 16 * 1024;

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ApiError) {
    return json<ApiErrorBody>(
      { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } },
      { status: err.status },
    );
  }
  // Never log request bodies, names, answers or tokens.
  console.error("Unhandled API error:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
  return json<ApiErrorBody>(
    { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

type Handler<C> = (req: NextRequest, ctx: C, db: DB) => Promise<Response>;

/** Wraps a route handler with a per-request DB handle, origin checks and JSON errors. */
export function route<C>(fn: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    let close: (() => Promise<void>) | null = null;
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const e = env();
      const handle = createDb(e.DATABASE_URL, e.DATABASE_DRIVER);
      close = handle.close;
      return await fn(req, ctx, handle.db);
    } catch (err) {
      return errorResponse(err);
    } finally {
      if (close) {
        const c = close;
        try {
          after(() => c().catch(() => {}));
        } catch {
          void c().catch(() => {});
        }
      }
    }
  };
}

/** Rejects cross-site mutation requests (CSRF defence in addition to SameSite=Lax cookies). */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // Non-browser clients and same-origin navigations may omit Origin.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError("FORBIDDEN", "Cross-site request blocked.");
  }
  const allowed = new Set<string>();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) allowed.add(host);
  const appUrl = env().NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).host);
    } catch {
      /* ignore malformed config */
    }
  }
  if (!allowed.has(originHost)) throw new ApiError("FORBIDDEN", "Cross-site request blocked.");
}

export async function readJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Request is too large.");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Request is too large.");
  let data: unknown = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError("VALIDATION", "Request body must be JSON.");
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError("VALIDATION", first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request.");
  }
  return parsed.data;
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "local";
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}

export function normalizeCode(raw: string): string {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) throw new ApiError("GAME_NOT_FOUND", "That game code doesn't look right. Codes have six characters.");
  return code;
}
