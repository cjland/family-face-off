import { z } from "zod";
import { ApiError } from "@/lib/errors";
import { createHostSession, setHostCookie, verifyHostPassword } from "@/server/auth";
import { clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rateLimit";

const body = z.object({ password: z.string().min(1).max(200) });

export const POST = route(async (req, _ctx, db) => {
  await rateLimit(db, `login:${clientIp(req)}`, 8, 300);
  const { password } = await readJson(req, body);
  if (!verifyHostPassword(password)) throw new ApiError("UNAUTHENTICATED", "That password isn't right.");
  const token = await createHostSession(db);
  const res = json({ ok: true });
  setHostCookie(res, token);
  return res;
});
