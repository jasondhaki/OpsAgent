import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Badge } from '@/components/ui/badge';
import { age, humanize } from '@/lib/format';
import { db } from '@/server/db/admin';
import { demoOrgId } from '@/server/demo';
import { env } from '@/server/env';
import { DemoSimulator } from './demo-simulator';

export const metadata: Metadata = {
  title: 'OpsAgent — live demo',
  description: 'An AI support agent where a deterministic gate, not the model, decides what needs a human.',
};

export default async function DemoPage() {
  await connection(); // live data per request, never frozen at build time (and no DB needed to build)
  const orgId = await demoOrgId(db);
  // Seeded fictional tickets only. Visitor runs (channel 'simulator') are never listed publicly.
  const { data: tickets } = await db
    .from('tickets')
    .select('id, subject, status, intent, risk_flags, gate, created_at')
    .eq('org_id', orgId)
    .neq('channel', 'simulator')
    .order('created_at', { ascending: false })
    .limit(12);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Live demo · fictional shop · no login</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">OpsAgent: an AI support agent that knows when to stop</h1>
        <p className="max-w-2xl text-muted-foreground">
          It reads customer email in English, Bangla and Banglish, answers only from the shop&apos;s knowledge base, and then a
          <strong> deterministic gate</strong> — plain code, not the model — decides whether a human must approve. Complaints,
          refunds, payments and bulk orders always go to a person. Auto-send is off until each intent earns it with measured data.
        </p>
      </header>

      <section aria-labelledby="try" className="space-y-3">
        <h2 id="try" className="text-lg font-semibold">Try it</h2>
        <DemoSimulator siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
      </section>

      <section aria-labelledby="inbox" className="space-y-3">
        <h2 id="inbox" className="text-lg font-semibold">Sample inbox</h2>
        {!tickets?.length ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No sample tickets seeded yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tickets.map((t) => {
              const would = (t.gate as { wouldAutosend?: boolean } | null)?.wouldAutosend;
              return (
                <li key={t.id}>
                  <Link href={`/demo/tickets/${t.id}`} className="block h-full rounded-xl border p-3 hover:bg-muted/50">
                    <div className="flex justify-between gap-2">
                      <p className="line-clamp-1 font-medium">{t.subject || '(no subject)'}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{age(t.created_at)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.intent && <Badge variant="secondary">{humanize(t.intent)}</Badge>}
                      {would !== undefined && <Badge variant="outline">{would ? 'would auto-send' : 'needs a human'}</Badge>}
                      {t.risk_flags.map((f) => <Badge key={f} variant="destructive">{humanize(f)}</Badge>)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="border-t pt-4 text-sm text-muted-foreground">
        Built on free tiers only: Next.js, Supabase, Gemini Flash-Lite (Groq fallback), Gmail via Apps Script, Telegram.{' '}
        <Link href="/login" className="underline">Owner login</Link>
      </footer>
    </main>
  );
}
