import "server-only";
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: optionalString,
  HOST_PASSWORD: z.string().min(8, "HOST_PASSWORD must be at least 8 characters"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: optionalString,
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_MODEL: optionalString,
  CRON_SECRET: optionalString,
  ENABLE_DEMO_TOOLS: optionalString,
  DATABASE_DRIVER: z.enum(["auto", "neon", "pg"]).optional().default("auto"),
  NODE_ENV: z.string().optional().default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/** Validates server environment variables once and caches the result. */
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function aiAvailable(): boolean {
  const e = env();
  return Boolean(e.OPENROUTER_API_KEY && e.OPENROUTER_MODEL);
}

/** Demo tools (bot players) are on in development, and opt-in elsewhere. */
export function demoToolsEnabled(): boolean {
  const e = env();
  if (e.ENABLE_DEMO_TOOLS === "true") return true;
  if (e.ENABLE_DEMO_TOOLS === "false") return false;
  return e.NODE_ENV !== "production";
}
