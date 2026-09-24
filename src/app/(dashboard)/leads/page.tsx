import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Classification } from '@/lib/contracts';
import { age, humanize } from '@/lib/format';
import { hasRole, requirePageMember } from '@/server/auth/requireMember';
import { userDb } from '@/server/db/user';
import { setLeadStatus } from './actions';

const STATUSES = ['new', 'contacted', 'won', 'lost'] as const;
const Lead = Classification.shape.lead.unwrap();

export default async function LeadsPage() {
  const m = await requirePageMember();
  const canEdit = hasRole(m.role, 'reviewer');
  const { data: leads, error } = await (await userDb())
    .from('tickets')
    .select('id, subject, lead, lead_status, status, created_at, customer:customers(email)')
    .eq('org_id', m.orgId)
    .eq('intent', 'custom_bulk_order')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Leads</h1>
        <p className="text-sm text-muted-foreground">Custom and bulk inquiries. The agent never quotes prices or dates for these — the owner replies personally.</p>
      </div>
      {!leads.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No custom or bulk inquiries yet.</p>
      ) : (
        <ul className="space-y-2">
          {leads.map((t) => {
            const lead = Lead.safeParse(t.lead).data;
            const status = t.lead_status ?? 'new';
            return (
              <li key={t.id} className="space-y-2 rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/tickets/${t.id}`} className="font-medium hover:underline">{t.subject || '(no subject)'}</Link>
                  <Badge variant={status === 'won' ? 'default' : status === 'lost' ? 'outline' : 'secondary'}>{status}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">{age(t.created_at)} ago</span>
                </div>
                <p className="text-sm text-muted-foreground">{t.customer?.email ?? 'unknown sender'}</p>
                {lead && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
                    <dt className="text-muted-foreground">Quantity</dt><dd>{lead.quantity ?? '—'}</dd>
                    <dt className="text-muted-foreground">Deadline</dt><dd>{lead.deadline ?? '—'}</dd>
                    <dt className="text-muted-foreground">Organisation</dt><dd>{humanize(lead.organizationType)}</dd>
                    <dt className="text-muted-foreground">Budget mentioned</dt><dd>{lead.budgetMentioned ? 'yes' : 'no'}</dd>
                    {lead.customization && (<><dt className="text-muted-foreground">Customisation</dt><dd className="col-span-1 sm:col-span-3">{lead.customization}</dd></>)}
                  </dl>
                )}
                {canEdit && (
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Lead status">
                    {STATUSES.map((s) => (
                      <form key={s} action={setLeadStatus}>
                        <input type="hidden" name="ticketId" value={t.id} />
                        <input type="hidden" name="status" value={s} />
                        <Button type="submit" size="xs" variant={s === status ? 'default' : 'outline'} aria-pressed={s === status}>{s}</Button>
                      </form>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
