import { ClaimRequest, claimOutbox } from '@/server/bridge/outbox';
import { db } from '@/server/db/admin';
import { defaultOrgId } from '@/server/db/repos/orgs';
import { env } from '@/server/env';
import { readSigned } from '@/server/security/hmac';

// POST (not GET) so it is signed exactly like every other bridge call.
export async function POST(req: Request) {
  const signed = await readSigned(req, [{ name: 'bridge', secret: env.BRIDGE_HMAC_SECRET }]);
  if (signed instanceof Response) return signed;
  const parsed = ClaimRequest.safeParse(signed.json);
  if (!parsed.success) return Response.json({ error: 'invalid payload' }, { status: 400 });
  const items = await claimOutbox(db, await defaultOrgId(db), parsed.data.limit, env.OUTBOUND_DAILY_CAP);
  return Response.json({ items });
}
