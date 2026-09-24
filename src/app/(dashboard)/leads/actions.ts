'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { currentMembership, requireMember } from '@/server/auth/requireMember';
import { db } from '@/server/db/admin';
import { addEvent } from '@/server/db/repos/tickets';

const Input = z.object({ ticketId: z.uuid(), status: z.enum(['new', 'contacted', 'won', 'lost']) });

export async function setLeadStatus(form: FormData) {
  const m0 = await currentMembership();
  if (!m0) throw new Error('forbidden');
  const m = await requireMember(m0.orgId, 'reviewer');
  const i = Input.parse({ ticketId: form.get('ticketId'), status: form.get('status') });
  const { data } = await db
    .from('tickets')
    .update({ lead_status: i.status, updated_at: new Date().toISOString() })
    .eq('id', i.ticketId)
    .eq('org_id', m.orgId)
    .eq('intent', 'custom_bulk_order')
    .select('id');
  if (!data?.length) throw new Error('not found');
  await addEvent(db, { orgId: m.orgId, ticketId: i.ticketId, actor: `user:${m.userId}`, type: 'lead_status_changed', data: { status: i.status } });
  revalidatePath('/leads');
}
