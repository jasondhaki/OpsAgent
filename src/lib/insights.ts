// Pure metric computation for /insights (unit-tested; the page only fetches rows).

export type InsightTicket = { id: string; created_at: string; intent: string | null; status: string; gate: unknown };
export type InsightEvent = { ticket_id: string; type: string; data: unknown; created_at: string };
export type InsightRun = { provider: string; ok: boolean; step: string };

const dhakaDay = (iso: string) => new Date(new Date(iso).getTime() + 6 * 3600_000).toISOString().slice(0, 10); // UTC+6, no DST

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function computeInsights(i: { tickets: InsightTicket[]; events: InsightEvent[]; runs: InsightRun[]; days: number; now?: number; primaryProvider?: string }) {
  const now = i.now ?? Date.now();
  // Tickets per Dhaka day, oldest first, zero-filled.
  const perDay = new Map<string, number>();
  for (let d = i.days - 1; d >= 0; d--) perDay.set(dhakaDay(new Date(now - d * 86_400_000).toISOString()), 0);
  for (const t of i.tickets) {
    const k = dhakaDay(t.created_at);
    if (perDay.has(k)) perDay.set(k, perDay.get(k)! + 1);
  }

  const intentMix = new Map<string, number>();
  for (const t of i.tickets) if (t.intent) intentMix.set(t.intent, (intentMix.get(t.intent) ?? 0) + 1);

  const gated = i.tickets.filter((t) => t.gate && typeof t.gate === 'object' && 'wouldAutosend' in t.gate);
  const would = gated.filter((t) => (t.gate as { wouldAutosend: boolean }).wouldAutosend).length;

  const intentOf = new Map(i.tickets.map((t) => [t.id, t.intent]));
  const approvals = new Map<string, { approved: number; unedited: number }>();
  const firstAt = (type: string) => {
    const m = new Map<string, number>();
    for (const e of i.events) if (e.type === type && !m.has(e.ticket_id)) m.set(e.ticket_id, new Date(e.created_at).getTime());
    return m;
  };
  for (const e of i.events) {
    if (e.type !== 'approved') continue;
    const intent = intentOf.get(e.ticket_id) ?? 'unknown';
    const a = approvals.get(intent) ?? { approved: 0, unedited: 0 };
    a.approved++;
    if (!(e.data as { edited?: boolean } | null)?.edited) a.unedited++;
    approvals.set(intent, a);
  }
  const ingested = firstAt('ingested');
  const drafted = firstAt('drafted');
  const sent = firstAt('sent');
  const minutes = (to: Map<string, number>) =>
    [...to].flatMap(([id, t]) => (ingested.has(id) && t >= ingested.get(id)! ? [(t - ingested.get(id)!) / 60_000] : []));

  const okRuns = i.runs.filter((r) => r.ok && r.step !== 'embed');
  const primary = i.primaryProvider ?? 'google';
  return {
    total: i.tickets.length,
    perDay: [...perDay].map(([day, count]) => ({ day, count })),
    intentMix: [...intentMix].map(([intent, count]) => ({ intent, count })).sort((a, b) => b.count - a.count),
    wouldAutosendRate: gated.length ? would / gated.length : null,
    gatedCount: gated.length,
    approvals: [...approvals].map(([intent, a]) => ({ intent, ...a })).sort((a, b) => b.approved - a.approved),
    medianMinutesToDraft: median(minutes(drafted)),
    medianMinutesToSend: median(minutes(sent)),
    fallbackRate: okRuns.length ? okRuns.filter((r) => r.provider !== primary).length / okRuns.length : null,
    errors: i.tickets.filter((t) => t.status === 'error').length + i.runs.filter((r) => !r.ok).length,
  };
}
