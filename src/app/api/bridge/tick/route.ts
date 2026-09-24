import { tick } from '@/server/bridge/tick';
import { defaultOrgId } from '@/server/db/repos/orgs';
import { pipelineDeps } from '@/server/deps';
import { env } from '@/server/env';
import { readSigned } from '@/server/security/hmac';

export const maxDuration = 20;

export async function POST(req: Request) {
  const signed = await readSigned(req, [
    { name: 'bridge', secret: env.BRIDGE_HMAC_SECRET },
    { name: 'cron', secret: env.CRON_SECRET },
  ]);
  if (signed instanceof Response) return signed;
  const deps = pipelineDeps();
  const res = await tick(deps, await defaultOrgId(deps.db), signed.signer === 'cron' ? 'cron' : 'bridge');
  return Response.json(res);
}
