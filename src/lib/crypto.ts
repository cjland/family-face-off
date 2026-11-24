import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes, base64url. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Keyed hash for storing session tokens; plaintext tokens are never stored. */
export function hashToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

/** Constant-time string comparison that does not leak length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Unguessable, reproducible key that lets a TV open the read-only display for one game. */
export function displayKey(gameId: string, secret: string): string {
  return createHmac("sha256", secret).update(`display:${gameId}`).digest("base64url").slice(0, 32);
}

// No 0/O/1/I to keep codes easy to read across a room.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function newGameCode(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function randomId(prefix = "o"): string {
  return `${prefix}_${randomBytes(6).toString("base64url")}`;
}
