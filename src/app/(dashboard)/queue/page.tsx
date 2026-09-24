import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Constants } from '@/lib/database.types';
import { age, humanize } from '@/lib/format';
import { requirePageMember } from '@/server/auth/requireMember';
import { userDb } from '@/server/db/user';

const E = Constants.public.Enums;
type Status = (typeof E.ticket_status)[number];

const pick = <T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | undefined =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

export default async function QueuePage({ searchParams }: PageProps<'/queue'>) {
  const m = await requirePageMember();
  const sp = await searchParams;
  const status: Status | 'all' = sp.status === 'all' ? 'all' : (pick(sp.status, E.ticket_status) ?? 'needs_review');
  const intent = pick(sp.intent, E.ticket_intent);
  const urgency = pick(sp.urgency, E.urgency_level);

  let q = (await userDb())
    .from('tickets')
    .select('id, subject, status, intent, urgency, language, risk_flags, channel, last_message_at, customer:customers(email)')
    .eq('org_id', m.orgId)
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (status !== 'all') q = q.eq('status', status);
  if (intent) q = q.eq('intent', intent);
  if (urgency) q = q.eq('urgency', urgency);
  const { data: tickets, error } = await q;
  if (error) throw error;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Queue</h1>
      {/* Plain GET form: filters live in the URL, no client JS needed. */}
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <Filter name="status" label="Status" value={status} options={['all', ...E.ticket_status]} />
        <Filter name="intent" label="Intent" value={intent ?? ''} options={['', ...E.ticket_intent]} />
        <Filter name="urgency" label="Urgency" value={urgency ?? ''} options={['', ...E.urgency_level]} />
        <Button type="submit" variant="outline" size="sm">Apply</Button>
      </form>

      {!tickets.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing here. {status === 'needs_review' && 'All caught up.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`} className="block rounded-xl border p-3 hover:bg-muted/50">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 font-medium">{t.subject || '(no subject)'}</p>
                  <span className="shrink-0 text-xs text-muted-foreground" title="Waiting since last message">{age(t.last_message_at)}</span>
                </div>
                <p className="line-clamp-1 text-sm text-muted-foreground">{t.customer?.email ?? 'unknown sender'}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant="outline">{humanize(t.status)}</Badge>
                  {t.intent && <Badge variant="secondary">{humanize(t.intent)}</Badge>}
                  {t.urgency === 'high' && <Badge variant="destructive">high urgency</Badge>}
                  {t.language && <Badge variant="outline">{t.language === 'bn' ? 'বাংলা' : t.language}</Badge>}
                  {t.channel === 'simulator' && <Badge variant="outline">simulator</Badge>}
                  {t.risk_flags.map((f) => (
                    <Badge key={f} variant="destructive">{humanize(f)}</Badge>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Filter({ name, label, value, options }: { name: string; label: string; value: string; options: readonly string[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select name={name} defaultValue={value} className="h-8 rounded-lg border bg-background px-2">
        {options.map((o) => (
          <option key={o} value={o}>{o ? humanize(o) : 'any'}</option>
        ))}
      </select>
    </label>
  );
}
