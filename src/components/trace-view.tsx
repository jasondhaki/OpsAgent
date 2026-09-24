import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { humanize } from '@/lib/format';

export type TraceResult = {
  outcome: string;
  reason?: string;
  trace: { step: string; ms: number; data: unknown }[];
  draft?: { body: string } | null;
  gate?: { wouldAutosend: boolean } | null;
};

/** Node-by-node pipeline trace (dashboard simulator and public demo). */
export function TraceView({ result, ms, ticketHref, note }: { result: TraceResult; ms?: number; ticketHref: string; note?: string }) {
  return (
    <div className="space-y-2">
      {note && <p role="status" className="rounded-lg bg-muted p-2 text-sm">{note}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge>{humanize(result.outcome)}</Badge>
        {result.reason && <Badge variant="destructive">{humanize(result.reason)}</Badge>}
        {result.gate && <Badge variant="outline">would auto-send: {result.gate.wouldAutosend ? 'yes' : 'no'}</Badge>}
        {ms !== undefined && <span className="text-muted-foreground">{(ms / 1000).toFixed(1)} s</span>}
        <Link href={ticketHref} className="ml-auto underline">Open ticket →</Link>
      </div>
      {result.draft && <p className="whitespace-pre-wrap rounded-lg border p-3 text-sm">{result.draft.body}</p>}
      <ol className="space-y-2">
        {result.trace.map((s, i) => (
          <li key={i}>
            <details className="rounded-lg border p-2 text-sm" open={s.step === 'gate'}>
              <summary className="cursor-pointer">
                <strong>{humanize(s.step)}</strong> <span className="text-muted-foreground">{s.ms} ms</span>
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(s.data, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
