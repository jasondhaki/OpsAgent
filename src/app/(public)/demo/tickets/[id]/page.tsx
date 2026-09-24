import { TicketView } from '@/components/ticket-view';
import { db } from '@/server/db/admin';
import { demoOrgId } from '@/server/demo';

// Read-only, no review actions. Scoped to the demo org: TicketView filters every query by orgId.
export default async function DemoTicketPage({ params }: PageProps<'/demo/tickets/[id]'>) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
      <TicketView sb={db} orgId={await demoOrgId(db)} id={id} back={{ href: '/demo', label: 'Demo' }} />
    </main>
  );
}
