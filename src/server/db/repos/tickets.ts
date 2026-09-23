import 'server-only';
import type { Db } from '@/server/db/admin';
import type { Database, Json } from '@/lib/database.types';
import { normalizeBody } from '@/server/pipeline/normalize';

type Channel = Database['public']['Enums']['channel'];

export async function addEvent(db: Db, e: { orgId: string; ticketId: string; actor: string; type: string; data?: Json }) {
  const { error } = await db
    .from('ticket_events')
    .insert({ org_id: e.orgId, ticket_id: e.ticketId, actor: e.actor, type: e.type, data: e.data ?? {} });
  if (error) throw error;
}

/** Upsert customer, find-or-create the ticket for the thread, insert the (normalised) inbound message. */
export async function createInbound(
  db: Db,
  m: {
    orgId: string;
    channel: Channel;
    fromEmail: string;
    subject: string | null;
    body: string;
    externalThreadId?: string | null;
    externalMessageId?: string | null;
    providerMessageId?: string | null;
    headers?: Json;
  },
): Promise<{ ticketId: string; messageId: string; customerBlocked: boolean }> {
  const { data: customer, error: ce } = await db
    .from('customers')
    .upsert({ org_id: m.orgId, email: m.fromEmail.toLowerCase() }, { onConflict: 'org_id,email' })
    .select('id, is_blocked')
    .single();
  if (ce) throw ce;

  let ticketId: string | null = null;
  if (m.externalThreadId) {
    const { data } = await db
      .from('tickets')
      .select('id')
      .eq('org_id', m.orgId)
      .eq('channel', m.channel)
      .eq('external_thread_id', m.externalThreadId)
      .maybeSingle();
    ticketId = data?.id ?? null;
  }
  if (!ticketId) {
    const { data, error } = await db
      .from('tickets')
      .insert({ org_id: m.orgId, channel: m.channel, customer_id: customer.id, subject: m.subject, external_thread_id: m.externalThreadId ?? null })
      .select('id')
      .single();
    if (error) throw error;
    ticketId = data.id;
  } else {
    // New message on an existing thread: re-run the pipeline from the start.
    await db
      .from('tickets')
      .update({ status: 'received', pipeline_step: null, classification: null, gate: null, last_message_at: new Date().toISOString() })
      .eq('id', ticketId);
  }

  const { data: msg, error: me } = await db
    .from('messages')
    .insert({
      org_id: m.orgId,
      ticket_id: ticketId,
      direction: 'inbound',
      from_address: m.fromEmail,
      body_text: normalizeBody(m.body),
      external_message_id: m.externalMessageId ?? null,
      provider_message_id: m.providerMessageId ?? null,
      headers: m.headers ?? {},
    })
    .select('id')
    .single();
  if (me) throw me;

  await addEvent(db, { orgId: m.orgId, ticketId, actor: m.channel === 'email' ? 'bridge' : 'system', type: 'ingested', data: { messageId: msg.id } });
  return { ticketId, messageId: msg.id, customerBlocked: customer.is_blocked };
}
