import { computeInsights } from '@/lib/insights';
import { daysAgoIso, humanize } from '@/lib/format';
import { requirePageMember } from '@/server/auth/requireMember';
import { userDb } from '@/server/db/user';

const DAYS = 30;
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const mins = (x: number | null) => (x === null ? '—' : x < 90 ? `${Math.round(x)} min` : `${(x / 60).toFixed(1)} h`);

export default async function InsightsPage() {
  const m = await requirePageMember();
  const sb = await userDb();
  const since = daysAgoIso(DAYS);
  // ponytail: pulls raw rows (capped) and aggregates in TS; move to SQL views when volume passes a few thousand/month.
  const [{ data: tickets, error }, { data: events }, { data: runs }] = await Promise.all([
    sb.from('tickets').select('id, created_at, intent, status, gate').eq('org_id', m.orgId).neq('channel', 'simulator').gte('created_at', since).limit(5000),
    sb.from('ticket_events').select('ticket_id, type, data, created_at').eq('org_id', m.orgId).in('type', ['ingested', 'drafted', 'approved', 'sent']).gte('created_at', since).limit(20000),
    sb.from('ai_runs').select('provider, ok, step').eq('org_id', m.orgId).gte('created_at', since).limit(20000),
  ]);
  if (error) throw error;
  const r = computeInsights({ tickets, events: events ?? [], runs: runs ?? [], days: DAYS });
  const maxDay = Math.max(1, ...r.perDay.map((d) => d.count));
  const maxIntent = Math.max(1, ...r.intentMix.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">Last {DAYS} days · real channels only (simulator excluded) · auto-send is measured in shadow mode.</p>
      </div>

      <section aria-label="Headline metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Tickets" value={String(r.total)} />
        <Stat label="Would auto-send" value={pct(r.wouldAutosendRate)} hint={`of ${r.gatedCount} gated`} />
        <Stat label="Median time to draft" value={mins(r.medianMinutesToDraft)} />
        <Stat label="Median time to send" value={mins(r.medianMinutesToSend)} hint="includes human review" />
        <Stat label="Fallback model used" value={pct(r.fallbackRate)} hint="of AI calls" />
        <Stat label="Errors" value={String(r.errors)} hint="error tickets + failed AI calls" />
      </section>

      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="font-semibold">Tickets per day</h2>
        <svg viewBox={`0 0 ${DAYS * 12} 100`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label={`Tickets per day over ${DAYS} days, peak ${maxDay}`}>
          <line x1="0" y1="99.5" x2={DAYS * 12} y2="99.5" className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {r.perDay.map((d, i) => {
            const h = (d.count / maxDay) * 92;
            return (
              <g key={d.day}>
                {/* Full-height hit target, larger than the bar, carries the tooltip. */}
                <rect x={i * 12} y="0" width="12" height="100" fill="transparent">
                  <title>{`${d.day}: ${d.count} ticket${d.count === 1 ? '' : 's'}`}</title>
                </rect>
                {d.count > 0 && <rect x={i * 12 + 1} y={100 - h} width="10" height={h} rx="2" className="pointer-events-none fill-primary" />}
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{r.perDay[0]?.day}</span>
          <span>peak {maxDay}/day</span>
          <span>{r.perDay.at(-1)?.day}</span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead><tr><th className="font-medium">Day (Dhaka)</th><th className="font-medium">Tickets</th></tr></thead>
            <tbody>{r.perDay.filter((d) => d.count).map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.count}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border p-4">
          <h2 className="font-semibold">Intent mix</h2>
          {!r.intentMix.length ? <p className="text-sm text-muted-foreground">No classified tickets yet.</p> : (
            <table className="w-full text-sm">
              <tbody>
                {r.intentMix.map((x) => (
                  <tr key={x.intent}>
                    <td className="w-40 py-1 pr-2">{humanize(x.intent)}</td>
                    <td className="py-1">
                      <div className="h-2 rounded-r bg-primary" style={{ width: `${(x.count / maxIntent) * 100}%` }} aria-hidden />
                    </td>
                    <td className="w-10 py-1 pl-2 text-right tabular-nums">{x.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-2 rounded-xl border p-4">
          <h2 className="font-semibold">Approved without edits</h2>
          <p className="text-xs text-muted-foreground">The evidence for turning auto-send on per intent (ADR 0004 / Phase 6).</p>
          {!r.approvals.length ? <p className="text-sm text-muted-foreground">No approvals yet.</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="text-xs text-muted-foreground"><th className="font-medium">Intent</th><th className="font-medium">Approved</th><th className="font-medium">No edits</th></tr></thead>
              <tbody>
                {r.approvals.map((a) => (
                  <tr key={a.intent}>
                    <td className="py-1">{humanize(a.intent)}</td>
                    <td className="py-1 tabular-nums">{a.approved}</td>
                    <td className="py-1 tabular-nums">{pct(a.unedited / a.approved)} <span className="text-muted-foreground">({a.unedited})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
