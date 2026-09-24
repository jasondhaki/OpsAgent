import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { currentMembership } from '@/server/auth/requireMember';
import { signOut } from './actions';

const NAV = [
  { href: '/queue', label: 'Queue' },
  { href: '/leads', label: 'Leads' },
  { href: '/insights', label: 'Insights' },
  { href: '/simulator', label: 'Simulator' },
  { href: '/kb', label: 'Knowledge base' },
  { href: '/settings', label: 'Settings' },
] as const;

export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const m = await currentMembership();
  if (!m) {
    // Signed in but not on the org_members allowlist: show nothing from any org.
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="text-sm text-muted-foreground">This account is not a member of any organisation. Ask the owner to add you.</p>
        <form action={signOut}>
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </main>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link href="/queue" className="font-semibold">OpsAgent</Link>
          <span className="text-sm text-muted-foreground">{m.orgName}</span>
          {m.isDemo && <Badge variant="secondary">demo</Badge>}
          <nav aria-label="Main" className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-2 py-1 text-sm hover:bg-muted">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto">
            <Button type="submit" variant="ghost" size="sm">Sign out</Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </div>
  );
}
