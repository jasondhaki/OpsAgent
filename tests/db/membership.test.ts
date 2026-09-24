import { beforeAll, describe, expect, it } from 'vitest';
import { localAnon, localDb } from './client';

// Phase 3 "done when": non-members see nothing. Dashboard reads go through RLS as the signed-in user.
const admin = localDb();
const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
let orgId: string;
const stamp = Date.now();
const memberEmail = `member-${stamp}@example.com`;
const outsiderEmail = `outsider-${stamp}@example.com`;

async function signedIn(email: string) {
  const c = localAnon();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

beforeAll(async () => {
  const { data: org, error } = await admin.from('orgs').insert({ slug: `test-member-${Date.now()}`, name: 'Member test' }).select('id').single();
  if (error) throw error;
  orgId = org.id;
  await admin.from('tickets').insert({ org_id: orgId, channel: 'simulator', subject: 'secret' });
  const { data: member } = await admin.auth.admin.createUser({ email: memberEmail, password, email_confirm: true });
  await admin.auth.admin.createUser({ email: outsiderEmail, password, email_confirm: true });
  await admin.from('org_members').insert({ org_id: orgId, user_id: member.user!.id, role: 'reviewer' });
});

describe('membership-scoped reads (RLS)', () => {
  it('a member sees their org and its tickets', async () => {
    const c = await signedIn(memberEmail);
    expect((await c.from('orgs').select('id').eq('id', orgId)).data).toHaveLength(1);
    expect((await c.from('tickets').select('subject').eq('org_id', orgId)).data).toEqual([{ subject: 'secret' }]);
  });

  it('a signed-in non-member sees nothing', async () => {
    const c = await signedIn(outsiderEmail);
    expect((await c.from('orgs').select('id').eq('id', orgId)).data).toEqual([]);
    expect((await c.from('tickets').select('id').eq('org_id', orgId)).data).toEqual([]);
  });

  it('members cannot write directly (writes go through server actions)', async () => {
    const c = await signedIn(memberEmail);
    await c.from('tickets').update({ status: 'closed' }).eq('org_id', orgId);
    expect((await admin.from('tickets').select('status').eq('org_id', orgId).single()).data?.status).toBe('received');
  });
});

