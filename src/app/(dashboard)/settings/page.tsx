import { z } from 'zod';
import { AUTOSEND_INTENTS, OrgSettings } from '@/lib/contracts';
import { hasRole, requirePageMember } from '@/server/auth/requireMember';
import { userDb } from '@/server/db/user';
import { SettingsForm, type IntentStats } from './settings-form';

const ApprovedData = z.object({ edited: z.boolean().optional() });

export default async function SettingsPage() {
  const m = await requirePageMember();
  const sb = await userDb();
  const [{ data: org, error }, { data: approvals }] = await Promise.all([
    sb.from('orgs').select('settings').eq('id', m.orgId).single(),
    // ponytail: scans every approval; move to a SQL view when approvals reach the thousands.
    sb.from('ticket_events').select('data, ticket:tickets(intent)').eq('org_id', m.orgId).eq('type', 'approved'),
  ]);
  if (error) throw error;

  const stats: IntentStats[] = AUTOSEND_INTENTS.map((intent) => {
    const rows = (approvals ?? []).filter((a) => a.ticket?.intent === intent);
    return { intent, approved: rows.length, unedited: rows.filter((a) => !ApprovedData.safeParse(a.data).data?.edited).length };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForm settings={OrgSettings.parse(org.settings)} stats={stats} canEdit={hasRole(m.role, 'owner')} />
    </div>
  );
}
