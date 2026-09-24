import { z } from 'zod';
import { runDemo } from '@/server/demo';
import { pipelineDeps } from '@/server/deps';
import { clientKey } from '@/server/security/rateLimit';
import { verifyTurnstile } from '@/server/security/turnstile';

export const maxDuration = 26;

const Input = z.object({
  subject: z.string().max(200).default(''),
  body: z.string().trim().min(1).max(2000),
  sample: z.string().max(20).nullish(),
  token: z.string().max(2048),
});

// Public, unauthenticated: Turnstile + per-IP and global daily limits + dry run in the demo org only.
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 16_384) return Response.json({ error: 'too large' }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = Input.safeParse(json);
  if (!parsed.success) return Response.json({ error: 'Write a message (max 2,000 characters).' }, { status: 400 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!(await verifyTurnstile(parsed.data.token, ip))) return Response.json({ error: 'Bot check failed — reload and try again.' }, { status: 403 });
  const res = await runDemo(pipelineDeps(), { visitorKey: clientKey(req.headers), subject: parsed.data.subject, body: parsed.data.body, sampleKey: parsed.data.sample ?? null });
  return Response.json(res);
}
