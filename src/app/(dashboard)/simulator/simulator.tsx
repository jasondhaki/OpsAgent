'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SAMPLES } from '@/lib/samples';
import { TraceView } from '@/components/trace-view';
import { simulateAction } from './actions';


export function Simulator() {
  const [state, run, pending] = useActionState(simulateAction, null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={run} className="space-y-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Sample messages">
          {SAMPLES.map((s) => (
            <Button key={s.label} type="button" variant="outline" size="xs" onClick={() => { setSubject(s.subject); setBody(s.body); }}>
              {s.label}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="email" defaultValue="customer@example.com" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="body">Message</Label>
          <Textarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40" maxLength={8000} required />
        </div>
        <Button type="submit" disabled={pending}>{pending ? 'Running pipeline…' : 'Run (dry run)'}</Button>
        <p className="text-xs text-muted-foreground">Uses the real models and your knowledge base. Nothing is ever sent from the simulator.</p>
      </form>

      <section aria-live="polite" aria-label="Pipeline trace" className="space-y-2">
        {!state && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">The node-by-node trace appears here.</p>}
        {state && !state.ok && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
        {state?.ok && <TraceView result={state.result} ms={state.ms} ticketHref={`/tickets/${state.ticketId}`} />}
      </section>
    </div>
  );
}
