'use client';

import { Button } from '@/components/ui/button';

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-10">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        {error.message === 'forbidden' ? 'You do not have permission for that.' : 'The error was logged. Try again.'}
        {error.digest && <span className="ml-1 font-mono text-xs">({error.digest})</span>}
      </p>
      <Button onClick={retry} variant="outline">Try again</Button>
    </div>
  );
}
