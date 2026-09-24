import { TicketView } from '@/components/ticket-view';
import { hasRole, requirePageMember } from '@/server/auth/requireMember';
import { userDb } from '@/server/db/user';
import { ReviewPanel } from './review-panel';

export default async function TicketPage({ params }: PageProps<'/tickets/[id]'>) {
  const m = await requirePageMember();
  const { id } = await params;
  return (
    <TicketView
      sb={await userDb()}
      orgId={m.orgId}
      id={id}
      back={{ href: '/queue', label: 'Queue' }}
      review={(p) => <ReviewPanel {...p} canReview={hasRole(m.role, 'reviewer')} isOwner={hasRole(m.role, 'owner')} />}
    />
  );
}
