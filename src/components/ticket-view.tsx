import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Classification, GateDecision, GroundednessReport, ValidatorReport } from '@/lib/contracts';
import { formatDhaka, humanize } from '@/lib/format';
import type { Db } from '@/server/db/admin';

const Citations = z.array(z.object({ chunkId: z.string(), title: z.string().nullable(), similarity: z.number().nullable() }));

const GATE_LABELS: Record<string, string> = {
  intent_allowed: 'Intent is eligible for auto-send',
  no_risk_flags: 'No risk flags',
  sentiment_ok: 'Sentiment positive or neutral',
  urgency_ok: 'Not high urgency',
  retrieval_strong: 'Strong knowledge-base match / verified order',
  validator_passed: 'Validator passed',
  grounded: 'Groundedness check: supported',
  no_human_request: 'Model did not ask for a human',
  thread_cap: 'Under the per-thread auto-reply cap',
  primary_model: 'Drafted by the primary model',
  customer_ok: 'Customer not blocked',
};

export type ReviewSlot = (p: { ticketId: string; draftId: string | null; draftBody: string; status: string }) => ReactNode;

/**
 * Ticket detail (thread, draft, gate checklist, classification, checks, timeline), shared by the
 * dashboard (user client, RLS) and the public demo (service client, demo org only).
 * Every query is scoped to `orgId` — with the service client, that scoping is the only guard.
 */
export async function TicketView({ sb, orgId, id, back, review }: { sb: Db; orgId: string; id: string; back: { href: string; label: string }; review?: ReviewSlot }) {
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: t } = await sb.from('tickets').select('*, customer:customers(email)').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!t) notFound();
  const [{ data: messages }, { data: drafts }, { data: events }] = await Promise.all([
    sb.from('messages').select('id, direction, from_address, body_text, created_at').eq('ticket_id', id).eq('org_id', orgId).order('created_at'),
    sb.from('drafts').select('id, version, body, author, citations, validator, groundedness, meta, created_at').eq('ticket_id', id).eq('org_id', orgId).order('version', { ascending: false }),
    sb.from('ticket_events').select('id, actor, type, data, created_at').eq('ticket_id', id).eq('org_id', orgId).order('created_at'),
  ]);
  const latest = drafts?.[0] ?? null;
  const latestAi = drafts?.find((d) => d.author === 'ai') ?? null;
  const cls = Classification.safeParse(t.classification).data;
  const gate = GateDecision.safeParse(t.gate).data;
  const validator = ValidatorReport.safeParse(latestAi?.validator).data;
  const grounded = GroundednessReport.safeParse(latestAi?.groundedness).data;
  const citations = Citations.safeParse(latestAi?.citations).data ?? [];
  const { data: chunks } = citations.length
    ? await sb.from('kb_chunks').select('id, content').eq('org_id', orgId).in('id', citations.map((c) => c.chunkId))
    : { data: [] };

  return (
    <div className="space-y-4">
      <div>
        <Link href={back.href} className="text-sm text-muted-foreground hover:underline">← {back.label}</Link>
        <h1 className="mt-1 text-xl font-semibold">{t.subject || '(no subject)'}</h1>
        <p className="text-sm text-muted-foreground">{t.customer?.email ?? 'unknown sender'} · {t.channel}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="outline">{humanize(t.status)}</Badge>
          {t.intent && <Badge variant="secondary">{humanize(t.intent)}</Badge>}
          {t.risk_flags.map((f) => <Badge key={f} variant="destructive">{humanize(f)}</Badge>)}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Thread</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {messages?.map((msg) => (
                <div key={msg.id} className={msg.direction === 'outbound' ? 'rounded-lg bg-muted p-3' : 'rounded-lg border p-3'}>
                  <p className="mb-1 text-xs text-muted-foreground">{msg.direction === 'inbound' ? msg.from_address : 'Us'} · {formatDhaka(msg.created_at)}</p>
                  <p className="whitespace-pre-wrap text-sm">{msg.body_text}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Draft {latest && <span className="font-normal text-muted-foreground">v{latest.version} · {latest.author === 'ai' ? 'AI' : 'edited by a human'}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {latest ? <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm">{latest.body}</p> : <p className="text-sm text-muted-foreground">No draft (AI unavailable, spam, or still processing). You can reply manually.</p>}
              {review?.({ ticketId: t.id, draftId: latest?.id ?? null, draftBody: latest?.body ?? '', status: t.status })}
            </CardContent>
          </Card>

          {citations.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Citations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {citations.map((c) => (
                  <details key={c.chunkId} className="rounded-lg border p-2 text-sm">
                    <summary className="cursor-pointer">
                      {c.title ?? 'Untitled'} {c.similarity !== null && <span className="text-muted-foreground">· similarity {c.similarity.toFixed(2)}</span>}
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{chunks?.find((x) => x.id === c.chunkId)?.content ?? 'Chunk no longer exists (document re-embedded).'}</p>
                  </details>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gate</CardTitle>
            </CardHeader>
            <CardContent>
              {gate ? (
                <>
                  <p className="mb-2 text-sm">
                    Would auto-send: <strong>{gate.wouldAutosend ? 'yes' : 'no'}</strong>
                    {gate.wouldAutosend && !gate.autosend && <span className="text-muted-foreground"> (shadow mode: auto-send is off)</span>}
                  </p>
                  <ul className="space-y-1 text-sm" aria-label="Gate checks">
                    {gate.checks.map((c) => (
                      <li key={c.id} className="flex gap-2">
                        <span aria-hidden className={c.passed ? 'text-green-600' : 'text-destructive'}>{c.passed ? '✓' : '✗'}</span>
                        <span>
                          <span className="sr-only">{c.passed ? 'Passed: ' : 'Failed: '}</span>
                          {GATE_LABELS[c.id] ?? humanize(c.id)}
                          {c.detail && <span className="block text-xs text-muted-foreground">{c.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Not evaluated.</p>
              )}
            </CardContent>
          </Card>

          {cls && (
            <Card>
              <CardHeader><CardTitle>Classification</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Intent</dt><dd>{humanize(cls.intent)}</dd>
                  <dt className="text-muted-foreground">Urgency</dt><dd>{cls.urgency}</dd>
                  <dt className="text-muted-foreground">Sentiment</dt><dd>{cls.sentiment}</dd>
                  <dt className="text-muted-foreground">Language</dt><dd>{cls.language}</dd>
                  {cls.orderRef && (<><dt className="text-muted-foreground">Order ref</dt><dd>{cls.orderRef}</dd></>)}
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{cls.reasoning}</p>
                {cls.lead && <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(cls.lead, null, 2)}</pre>}
              </CardContent>
            </Card>
          )}

          {(validator || grounded) && (
            <Card>
              <CardHeader><CardTitle>Checks on the AI draft</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {validator && (
                  <div>
                    <p>Validator: <strong>{validator.passed ? 'passed' : 'failed'}</strong></p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {validator.violations.map((v, i) => <li key={i}><code>{v.code}</code> {v.detail}</li>)}
                    </ul>
                  </div>
                )}
                {grounded && (
                  <div>
                    <p>Groundedness: <strong>{humanize(grounded.verdict)}</strong></p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {grounded.unsupportedClaims.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {events?.map((e) => (
                  <li key={e.id} className="border-l-2 pl-2">
                    <p><strong>{humanize(e.type)}</strong> <span className="text-muted-foreground">by {e.actor}</span></p>
                    <p className="text-xs text-muted-foreground">{formatDhaka(e.created_at)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
