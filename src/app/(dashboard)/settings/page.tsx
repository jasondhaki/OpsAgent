import { z } from 'zod';
import { AUTOSEND_INTENTS, OrgSettings } from '@/lib/contracts';
import { age, formatDhaka, minutesSince } from '@/lib/format';
import { hasRole, requirePageMember } from '@/server/auth/requireMember';
import { userDb } from '@/server/db/user';
import { SettingsForm, type IntentStats } from './settings-form';

const ApprovedData = z.object({ edited: z.boolean().optional() });

export default async function SettingsPage() {
  const m = await requirePageMember();
  const sb = await userDb();
  const [{ data: org, error }, { data: approvals }, { data: hb }] = await Promise.all([
    sb.from('orgs').select('settings').eq('id', m.orgId).single(),
    // ponytail: scans every approval; move to a SQL view when approvals reach the thousands.
    sb.from('ticket_events').select('data, ticket:tickets(intent)').eq('org_id', m.orgId).eq('type', 'approved'),
    sb.from('bridge_heartbeats').select('last_seen_at, source').eq('org_id', m.orgId).maybeSingle(),
  ]);
  // The bridge ticks every 5 min and the backup cron every 15: 20 min of silence means something is wrong.
  const stale = !hb || minutesSince(hb.last_seen_at) > 20;
  if (error) throw error;

  const stats: IntentStats[] = AUTOSEND_INTENTS.map((intent) => {
    const rows = (approvals ?? []).filter((a) => a.ticket?.intent === intent);
    return { intent, approved: rows.length, unedited: rows.filter((a) => !ApprovedData.safeParse(a.data).data?.edited).length };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p role="status" className={stale ? 'rounded-lg bg-destructive/10 p-3 text-sm text-destructive' : 'rounded-lg border p-3 text-sm'}>
        {hb
          ? `Gmail bridge last seen ${age(hb.last_seen_at)} ago (${formatDhaka(hb.last_seen_at)}, via ${hb.source === 'cron' ? 'backup cron' : 'Gmail bridge'}).`
          : 'Gmail bridge has never checked in. See bridge/apps-script/SETUP.md.'}
        {hb && stale && ' No email is being picked up or sent — check the Apps Script trigger.'}
      </p>
      <SettingsForm settings={OrgSettings.parse(org.settings)} stats={stats} canEdit={hasRole(m.role, 'owner')} />
    </div>
  );
}
