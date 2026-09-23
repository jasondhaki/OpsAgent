import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDb } from './client';
import { fakeEmbedder } from '@/server/ai/fake';
import { embedDocument } from '@/server/kb/ingest';
import { searchKb } from '@/server/pipeline/retrieve';
import { enqueueJob } from '@/server/jobs/queue';
import { runJobs } from '@/server/jobs/runner';

const db = localDb();
const embedder = fakeEmbedder();
let orgId: string;

beforeAll(async () => {
  const { data, error } = await db
    .from('orgs')
    .insert({ slug: `test-kb-${Date.now()}`, name: 'KB test org', is_demo: true })
    .select('id')
    .single();
  if (error) throw error;
  orgId = data.id;
});
afterAll(async () => {
  await db.from('jobs').delete().eq('org_id', orgId);
  await db.from('orgs').delete().eq('id', orgId);
});

describe('knowledge base', () => {
  it('rejects activating a document that still has placeholders', async () => {
    const { error } = await db
      .from('kb_documents')
      .insert({ org_id: orgId, title: 'x', kind: 'policy', content: 'Fee is {{FEE}}', is_active: true });
    expect(error?.message).toMatch(/kb_documents_no_placeholders_when_active/);
  });

  it('embeds a document and retrieves the right chunk; inactive docs are excluded', async () => {
    const { data: docs, error } = await db
      .from('kb_documents')
      .insert([
        { org_id: orgId, title: 'Delivery', kind: 'policy', content: '# Outside Dhaka\nDelivery outside Dhaka costs 130 taka.' },
        { org_id: orgId, title: 'Care', kind: 'care', content: '# Washing\nDo not machine wash jute bags.' },
      ])
      .select('id, title');
    if (error) throw error;
    for (const d of docs) await embedDocument(db, embedder, d.id);

    const hits = await searchKb(db, embedder, orgId, 'delivery outside Dhaka cost');
    expect(hits[0].title).toBe('Delivery');
    expect(hits[0].similarity).toBeGreaterThan(hits[1].similarity);

    await db.from('kb_documents').update({ is_active: false }).eq('title', 'Delivery').eq('org_id', orgId);
    const after = await searchKb(db, embedder, orgId, 'delivery outside Dhaka cost');
    expect(after.map((h) => h.title)).not.toContain('Delivery');
  });

  it('re-embedding replaces chunks instead of duplicating them', async () => {
    const { data: doc } = await db
      .from('kb_documents')
      .insert({ org_id: orgId, title: 'Twice', kind: 'faq', content: 'Hello' })
      .select('id')
      .single();
    await embedDocument(db, embedder, doc!.id);
    await embedDocument(db, embedder, doc!.id);
    const { count } = await db.from('kb_chunks').select('*', { count: 'exact', head: true }).eq('document_id', doc!.id);
    expect(count).toBe(1);
  });
});

describe('job runner', () => {
  it('marks success done, retries failures with backoff, and dead-letters at max attempts', async () => {
    const ok = await enqueueJob(db, { orgId, type: 'sync_catalog', payload: {} });
    const bad = await enqueueJob(db, { orgId, type: 'remind_reviewers', payload: {} });
    await db.from('jobs').update({ max_attempts: 2 }).eq('id', bad);

    const handlers = {
      sync_catalog: async () => {},
      remind_reviewers: async () => { throw new Error('boom'); },
    };
    await runJobs(db, handlers, { budgetMs: 5000 });

    const { data: j1 } = await db.from('jobs').select('*').in('id', [ok, bad]);
    const byId = Object.fromEntries(j1!.map((j) => [j.id, j]));
    expect(byId[ok].status).toBe('done');
    expect(byId[bad].status).toBe('queued');
    expect(byId[bad].last_error).toBe('boom');
    expect(new Date(byId[bad].run_after).getTime()).toBeGreaterThan(Date.now());

    // Make it due again; second failure hits max_attempts → dead.
    await db.from('jobs').update({ run_after: new Date(0).toISOString() }).eq('id', bad);
    await runJobs(db, handlers, { budgetMs: 5000 });
    const { data: j2 } = await db.from('jobs').select('status').eq('id', bad).single();
    expect(j2!.status).toBe('dead');
  });
});
