// Usage (loads .env.local):
//   pnpm kb load <org-slug> <dir>     import *.md (frontmatter: title, kind, language) and embed
//   pnpm kb query <org-slug> "<text>" show top chunks + similarity
//   pnpm kb check                     retrieval check on the demo KB (kb-seed/demo/retrieval-check.json)
// Add --fake to use the offline keyword embedder instead of Gemini (smoke test only).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '@/server/db/admin';
import { geminiEmbedder } from '@/server/ai/embed';
import { fakeEmbedder } from '@/server/ai/fake';
import { findPlaceholders } from '@/lib/placeholders';
import { enqueueJob } from '@/server/jobs/queue';
import { runJobs } from '@/server/jobs/runner';
import { jobHandlers } from '@/server/jobs/handlers';
import { searchKb } from '@/server/pipeline/retrieve';

const fake = process.argv.includes('--fake');
const [cmd, ...args] = process.argv.slice(2).filter((a) => a !== '--fake');
const embedder = fake ? fakeEmbedder() : geminiEmbedder(db);

type Kind = 'faq' | 'policy' | 'product' | 'care' | 'approved_answer';
type Lang = 'bn' | 'en' | 'mixed';

async function orgId(slug: string): Promise<string> {
  const { data, error } = await db.from('orgs').select('id').eq('slug', slug).single();
  if (error) throw new Error(`org not found: ${slug}`);
  return data.id;
}

function parseDoc(raw: string) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('missing frontmatter');
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.title || !meta.kind) throw new Error('frontmatter needs title and kind');
  return { title: meta.title, kind: meta.kind as Kind, language: (meta.language ?? 'en') as Lang, content: m[2].trim() };
}

async function load(slug: string, dir: string) {
  const org = await orgId(slug);
  const jobIds: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
    const doc = parseDoc(readFileSync(join(dir, file), 'utf8'));
    const missing = findPlaceholders(doc.content);
    const row = { ...doc, org_id: org, is_active: missing.length === 0, updated_at: new Date().toISOString() };

    const { data: existing } = await db.from('kb_documents').select('id, version').eq('org_id', org).eq('title', doc.title).maybeSingle();
    const { data, error } = existing
      ? await db.from('kb_documents').update({ ...row, version: existing.version + 1 }).eq('id', existing.id).select('id').single()
      : await db.from('kb_documents').insert(row).select('id').single();
    if (error) throw error;

    if (missing.length) {
      console.log(`INACTIVE  ${file}: ${missing.length} placeholders left (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''})`);
    } else {
      jobIds.push(await enqueueJob(db, { orgId: org, type: 'embed_document', payload: { documentId: data.id } }));
      console.log(`queued    ${file}`);
    }
  }
  if (!jobIds.length) return;
  await runJobs(db, jobHandlers({ db, embedder }), { budgetMs: 120_000, batch: 1 });
  const { data: jobs } = await db.from('jobs').select('status, last_error, payload').in('id', jobIds);
  for (const j of jobs ?? []) if (j.status !== 'done') console.log(`FAILED    ${JSON.stringify(j.payload)}: ${j.last_error}`);
  console.log(`embedded ${(jobs ?? []).filter((j) => j.status === 'done').length}/${jobIds.length} documents`);
}

async function query(slug: string, text: string) {
  for (const r of await searchKb(db, embedder, await orgId(slug), text)) {
    console.log(`${r.similarity.toFixed(3)}  ${r.title}  | ${r.content.split('\n')[0].slice(0, 80)}`);
  }
}

async function check() {
  const org = await orgId('demo');
  const cases: { q: string; expect: string; lang: string }[] = JSON.parse(readFileSync('kb-seed/demo/retrieval-check.json', 'utf8'));
  let top1 = 0;
  let top3 = 0;
  for (const c of cases) {
    const hits = await searchKb(db, embedder, org, c.q, 3);
    const rank = hits.findIndex((h) => h.title === c.expect);
    if (rank === 0) top1++;
    if (rank >= 0) top3++;
    console.log(`${rank === 0 ? 'OK  ' : rank > 0 ? `@${rank + 1}  ` : 'MISS'} [${c.lang}] ${c.q}  → ${hits[0]?.title} (${hits[0]?.similarity.toFixed(3)})`);
  }
  console.log(`\nhit@1 ${top1}/${cases.length}   hit@3 ${top3}/${cases.length}   embedder=${embedder.model}`);
  if (top1 < cases.length) process.exitCode = 1;
}

const commands: Record<string, () => Promise<void>> = {
  load: () => load(args[0], args[1]),
  query: () => query(args[0], args[1]),
  check,
};
if (!commands[cmd]) {
  console.log('usage: pnpm kb load <org> <dir> | query <org> "<text>" | check  [--fake]');
  process.exit(1);
}
await commands[cmd]();
