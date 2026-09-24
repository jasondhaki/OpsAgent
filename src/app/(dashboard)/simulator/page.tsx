import { requirePageMember } from '@/server/auth/requireMember';
import { Simulator } from './simulator';

export default async function SimulatorPage() {
  await requirePageMember('reviewer');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Simulator</h1>
        <p className="text-sm text-muted-foreground">Send a pretend customer message through the full pipeline and watch every step.</p>
      </div>
      <Simulator />
    </div>
  );
}
