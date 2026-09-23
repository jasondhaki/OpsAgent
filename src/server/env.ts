import 'server-only';
import { z } from 'zod';

// Secrets must be >= 32 chars (CLAUDE.md §11). Optional until the phase that needs them;
// tighten to required as each integration lands.
const secret = z.string().min(32).optional();
const optionalStr = z.string().min(1).optional();

const EnvSchema = z.object({
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  DEFAULT_ORG_SLUG: z.string().default('jhunus-crafts'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: optionalStr,
  GROQ_API_KEY: optionalStr,
  MODEL_PRIMARY: optionalStr,
  MODEL_FALLBACK: optionalStr,
  EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  EMBEDDING_DIM: z.coerce.number().int().default(768),
  DAILY_CAP_GOOGLE: z.coerce.number().int().default(400),
  DAILY_CAP_GROQ: z.coerce.number().int().default(800),
  BRIDGE_HMAC_SECRET: secret,
  CRON_SECRET: secret,
  TELEGRAM_BOT_TOKEN: optionalStr,
  TELEGRAM_WEBHOOK_SECRET: secret,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalStr,
  TURNSTILE_SECRET_KEY: optionalStr,
  ORDER_ADAPTER: z.enum(['mock', 'http']).default('mock'),
  STOREFRONT_API_BASE: z.url().optional(),
  STOREFRONT_HMAC_SECRET: secret,
  OUTBOUND_DAILY_CAP: z.coerce.number().int().default(80),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings (as in a copied .env.example) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${fields}`); // names only, never values
  }
  return result.data;
}

export const env = parseEnv(process.env);
