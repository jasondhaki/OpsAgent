import { AckRequest, ackOutbox } from '@/server/bridge/outbox';
import { db } from '@/server/db/admin';
import { defaultOrgId } from '@/server/db/repos/orgs';
import { env } from '@/server/env';
import { readSigned } from '@/server/security/hmac';

export async function POST(req: Request) {
  const signed = await readSigned(req, [{ name: 'bridge', secret: env.BRIDGE_HMAC_SECRET }]);
  if (signed instanceof Response) return signed;
  const parsed = AckRequest.safeParse(signed.json);
  if (!parsed.success) return Response.json({ error: 'invalid payload' }, { status: 400 });
  return Response.json({ results: await ackOutbox(db, await defaultOrgId(db), parsed.data.items) });
}
