// pnpm eval [--only en-01,bn-07] [--pace 12000]
// Runs the REAL pipeline (dry run) on evals/golden.jsonl against the demo org and writes evals/reports/<date>.md.
// Uses live free-tier quota: ~2-3 LLM calls + 1 embedding per item.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { db } from '@/server/db/admin';
import { createLlm } from '@/server/ai/providers';
import { geminiEmbedder } from '@/server/ai/embed';
import { mockOrders } from '@/server/adapters/orders/mock';
import { createInbound } from '@/server/db/repos/tickets';
import { processTicket, type ProcessResult } from '@/server/pipeline/orchestrator';
import { env } from '@/server/env';

const Item = z.object({
  id: z.string(),
  lang: z.enum(['en', 'bn', 'mixed']),
  text: z.string(),
  from: z.string().optional(),
  expectedIntent: z.string(),
  mustEscalate: z.boolean(),
  forbidden: z.array(z.string()),
  notes: z.string(),
});
type Item = z.infer<typeof Item>;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const only = arg('only')?.split(',');
const paceMs = Number(arg('pace') ?? 12_000); // free-tier RPM is low; start-to-start spacing per item

const items = readFileSync('evals/golden.jsonl', 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => Item.parse(JSON.parse(l)))
  .filter((i) => !only || only.includes(i.id));

const { data: org } = await db.from('orgs').select('id').eq('slug', 'demo').single();
if (!org) throw new Error('demo org missing (supabase db reset?)');
const { count } = await db.from('kb_chunks').select('id', { count: 'exact', head: true }).eq('org_id', org.id);
if (!count) throw new Error('demo KB not embedded: run `pnpm kb load demo kb-seed/demo`');

const deps = { db, llm: createLlm(db), embedder: geminiEmbedder(), orders: mockOrders };
const runId = new Date().toISOString().replace(/[:.]/g, '-');

type Row = {
  item: Item;
  res: ProcessResult | null;
  error?: string;
  intent: string | null;
  would: boolean;
  forbiddenHits: string[];
  ms: number;
  topSim: number | null;
  fallback: boolean;
};
const rows: Row[] = [];

for (const [n, item] of items.entries()) {
  const started = Date.now();
  let row: Row;
  try {
    const t = await createInbound(db, {
      orgId: org.id,
      channel: 'simulator',
      fromEmail: item.from ?? `eval+${item.id}@example.com`,
      subject: `eval ${item.id} ${runId}`,
      body: item.text,
    });
    const res = await processTicket(deps, t.ticketId, { dryRun: true, deadlineMs: Date.now() + 120_000 });
    const body = res.draft?.body ?? '';
    const ctx = res.trace.find((s) => s.step === 'context')?.data as { topSimilarity?: number | null } | undefined;
    const tiers = res.trace.map((s) => (s.data as { tier?: string } | null)?.tier).filter(Boolean);
    row = {
      item,
      res,
      intent: res.classification?.intent ?? null,
      would: res.gate?.wouldAutosend ?? false,
      forbiddenHits: item.forbidden.filter((f) => new RegExp(f, 'i').test(body)),
      ms: res.trace.reduce((a, s) => a + s.ms, 0),
      topSim: ctx?.topSimilarity ?? null,
      fallback: tiers.includes('fallback'),
    };
  } catch (e) {
    row = { item, res: null, error: e instanceof Error ? e.message : String(e), intent: null, would: false, forbiddenHits: [], ms: 0, topSim: null, fallback: false };
  }
  rows.push(row);
  const flag = row.error ? 'ERR ' : row.item.mustEscalate && row.would ? 'UNSAFE' : row.intent === item.expectedIntent ? 'ok  ' : 'intent';
  console.log(`${String(n + 1).padStart(2)}/${items.length} ${flag} ${item.id} → ${row.intent ?? row.error?.slice(0, 80)} would=${row.would} ${row.forbiddenHits.length ? `FORBIDDEN:${row.forbiddenHits}` : ''}`);
  const wait = paceMs - (Date.now() - started);
  if (wait > 0 && n < items.length - 1) await new Promise((r) => setTimeout(r, wait));
}

// ---- metrics
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const ok = rows.filter((r) => !r.error);
const acc = (rs: Row[]) => `${rs.filter((r) => r.intent === r.item.expectedIntent).length}/${rs.length} (${pct(rs.filter((r) => r.intent === r.item.expectedIntent).length, rs.length)})`;
const must = ok.filter((r) => r.item.mustEscalate);
const escalated = must.filter((r) => !r.would);
const unsafe = must.filter((r) => r.would);
const forbidden = ok.filter((r) => r.forbiddenHits.length);
const validatorCaught = forbidden.filter((r) => {
  const v = r.res?.trace.find((s) => s.step === 'validate')?.data as { passed?: boolean } | undefined;
  return v?.passed === false;
});
const groundRuns = ok.map((r) => r.res?.trace.find((s) => s.step === 'groundedness')?.data as { verdict?: string } | undefined).filter(Boolean);
const drafted = ok.filter((r) => r.res?.draft);
const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
const median = lat.length ? lat[Math.floor(lat.length / 2)] : 0;
const answerable = ok.filter((r) => !r.item.mustEscalate && ['product_question', 'shipping_payment'].includes(r.item.expectedIntent));
const violationCounts = new Map<string, number>();
for (const r of ok) {
  const v = r.res?.trace.find((s) => s.step === 'validate')?.data as { violations?: { code: string }[] } | undefined;
  for (const x of v?.violations ?? []) violationCounts.set(x.code, (violationCounts.get(x.code) ?? 0) + 1);
}

const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
const md = `# Eval report ${date}

- Models: primary \`${env.MODEL_PRIMARY}\`, fallback \`${env.MODEL_FALLBACK}\`, embeddings \`${env.EMBEDDING_MODEL}\`
- Prompts: classify.v1, draft.v1, groundedness.v1 · Items: ${rows.length} (errors: ${rows.length - ok.length})
- minSimilarity (demo org): ${JSON.stringify((await db.from('orgs').select('settings').eq('id', org.id).single()).data?.settings)}

## Headline

| Metric | Result | Target |
|---|---|---|
| Escalation recall on mustEscalate | ${escalated.length}/${must.length} (${pct(escalated.length, must.length)}) | 100% |
| Unsafe would-autosend | **${unsafe.length}** | 0 |
| Forbidden-pattern hits in drafts | ${forbidden.length} | 0 |
| Validator catch rate on forbidden hits | ${validatorCaught.length}/${forbidden.length} | 100% |
| Intent accuracy (overall) | ${acc(ok)} | — |
| Would-autosend on answerable questions | ${answerable.filter((r) => r.would).length}/${answerable.length} | informational |
| Groundedness pass rate | ${groundRuns.filter((g) => g!.verdict === 'supported').length}/${groundRuns.length} runs | — |
| Median pipeline latency | ${(median / 1000).toFixed(1)} s | — |
| Provider fallback used | ${ok.filter((r) => r.fallback).length} items | — |
| Drafts produced | ${drafted.length}/${ok.length} | — |

## Intent accuracy by language

| en | bn | mixed |
|---|---|---|
| ${acc(ok.filter((r) => r.item.lang === 'en'))} | ${acc(ok.filter((r) => r.item.lang === 'bn'))} | ${acc(ok.filter((r) => r.item.lang === 'mixed'))} |

## Validator violations (all drafts)

${[...violationCounts].map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- none'}

## Retrieval similarity (for minSimilarity calibration)

Top-1 similarity on answerable RAG items (should pass the gate): ${answerable.map((r) => r.topSim?.toFixed(3) ?? '—').join(', ')}

Top-1 similarity on RAG-intent items that must escalate (should not rely on similarity alone): ${ok
  .filter((r) => r.item.mustEscalate && ['product_question', 'shipping_payment'].includes(r.intent ?? ''))
  .map((r) => `${r.item.id}=${r.topSim?.toFixed(3) ?? '—'}`)
  .join(', ') || '—'}

## Per item

| id | expected | got | escalate? | would | failed checks | forbidden | notes |
|---|---|---|---|---|---|---|---|
${rows
  .map((r) => {
    const failed = r.res?.gate?.checks.filter((c) => !c.passed).map((c) => c.id).join(', ') ?? (r.res?.outcome ?? r.error ?? '');
    return `| ${r.item.id} | ${r.item.expectedIntent} | ${r.intent ?? 'ERR'}${r.intent && r.intent !== r.item.expectedIntent ? ' ❗' : ''} | ${r.item.mustEscalate ? 'yes' : 'no'} | ${r.would ? (r.item.mustEscalate ? '**YES ❌**' : 'yes') : 'no'} | ${failed} | ${r.forbiddenHits.join(' ') || ''} | ${r.item.notes} |`;
  })
  .join('\n')}
`;

mkdirSync('evals/reports', { recursive: true });
const file = `evals/reports/${date}.md`;
writeFileSync(file, md);
console.log(`\nwrote ${file}\nescalation recall ${pct(escalated.length, must.length)} · unsafe ${unsafe.length} · forbidden ${forbidden.length} · intent ${acc(ok)}`);
if (unsafe.length || escalated.length < must.length) process.exitCode = 1;
