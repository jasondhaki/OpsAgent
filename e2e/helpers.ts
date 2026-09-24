import { execSync } from 'node:child_process';
import type { BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '../src/lib/database.types';

const out = execSync('pnpm exec supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?`, 'm').exec(out)?.[1] ?? '';
const API_URL = get('API_URL');
const ANON_KEY = get('ANON_KEY');

export const admin = createClient<Database>(API_URL, get('SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const PASSWORD = 'E2e-local-only-pw-1!';

/** Local test user (optionally a member of `orgSlug`). Stands in for Google OAuth, which can't be automated. */
export async function ensureUser(email: string, orgSlug?: string, role: 'owner' | 'reviewer' | 'viewer' = 'owner') {
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = created.data.user?.id ?? (await admin.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === email)!.id;
  if (orgSlug) {
    const { data: org } = await admin.from('orgs').select('id').eq('slug', orgSlug).single();
    await admin.from('org_members').upsert({ org_id: org!.id, user_id: id, role });
  }
  return id;
}

/** Sign in with a password and copy the @supabase/ssr session cookies into the browser context. */
export async function signIn(context: BrowserContext, email: string) {
  const jar: { name: string; value: string }[] = [];
  const sb = createServerClient(API_URL, ANON_KEY, {
    cookies: { getAll: () => jar, setAll: (list) => list.forEach((c) => jar.push({ name: c.name, value: c.value })) },
  });
  const { error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  await context.addCookies(jar.map((c) => ({ ...c, domain: 'localhost', path: '/' })));
}

/** An email ticket parked in needs_review with one AI draft, as the pipeline would leave it. */
export async function seedReviewTicket(orgSlug: string, subject: string) {
  const { data: org } = await admin.from('orgs').select('id').eq('slug', orgSlug).single();
  const orgId = org!.id;
  const { data: cust } = await admin.from('customers').upsert({ org_id: orgId, email: 'rina.demo@example.com' }, { onConflict: 'org_id,email' }).select('id').single();
  const { data: t, error } = await admin
    .from('tickets')
    .insert({
      org_id: orgId, channel: 'email', customer_id: cust!.id, subject, status: 'needs_review', intent: 'complaint_return',
      urgency: 'medium', sentiment: 'negative', language: 'en', risk_flags: ['damaged_item'], external_thread_id: `e2e-${Date.now()}-${Math.random()}`,
      classification: { intent: 'complaint_return', urgency: 'medium', sentiment: 'negative', language: 'en', orderRef: null, productMentions: [], lead: null, riskFlags: ['damaged_item'], reasoning: 'Customer reports damage.' },
      gate: { wouldAutosend: false, autosend: false, score: 0, checks: [{ id: 'intent_allowed', passed: false, detail: 'complaint_return' }, { id: 'no_risk_flags', passed: false, detail: 'damaged_item' }, { id: 'validator_passed', passed: true }] },
    })
    .select('id')
    .single();
  if (error) throw error;
  await admin.from('messages').insert({ org_id: orgId, ticket_id: t.id, direction: 'inbound', from_address: 'rina.demo@example.com', body_text: 'The strap came torn after two days.', provider_message_id: 'gm-e2e' });
  const { data: d } = await admin.from('drafts').insert({ org_id: orgId, ticket_id: t.id, version: 1, body: 'Sorry to hear that. Could you send a photo?', author: 'ai', validator: { passed: true, violations: [] }, meta: { tier: 'primary' } }).select('id').single();
  await admin.from('ticket_events').insert({ org_id: orgId, ticket_id: t.id, actor: 'bridge', type: 'ingested' });
  return { ticketId: t.id, draftId: d!.id };
}
