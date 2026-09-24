import { IngestPayload } from '@/lib/contracts';
import { ingestEmail } from '@/server/bridge/ingest';
import { db } from '@/server/db/admin';
import { defaultOrgId } from '@/server/db/repos/orgs';
import { env } from '@/server/env';
import { readSigned } from '@/server/security/hmac';

// Fast path, no LLM: verify, dedupe, filter loops, store, enqueue (CLAUDE.md §7.1).
export async function POST(req: Request) {
  const signed = await readSigned(req, [{ name: 'bridge', secret: env.BRIDGE_HMAC_SECRET }]);
  if (signed instanceof Response) return signed;
  const parsed = IngestPayload.safeParse(signed.json);
  if (!parsed.success) return Response.json({ error: 'invalid payload', fields: parsed.error.issues.map((i) => i.path.join('.')) }, { status: 400 });
  const res = await ingestEmail(db, await defaultOrgId(db), parsed.data);
  return Response.json(res, { status: res.status === 'duplicate' ? 200 : 202 });
}
