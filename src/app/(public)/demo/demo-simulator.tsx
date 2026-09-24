'use client';

import Script from 'next/script';
import { useCallback, useRef, useState } from 'react';
import { TraceView, type TraceResult } from '@/components/trace-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SAMPLES } from '@/lib/samples';

type Turnstile = { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void }) => string; reset: (id?: string) => void };
declare global {
  interface Window { turnstile?: Turnstile }
}

type Res =
  | { mode: 'live'; result: TraceResult; ticketId: string; ms: number }
  | { mode: 'replay'; result: TraceResult; ticketId: string | null; note: string }
  | { mode: 'unavailable'; note: string }
  | { error: string };

export function DemoSimulator({ siteKey }: { siteKey: string | null }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sample, setSample] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const widget = useRef<string | null>(null);

  const mount = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !siteKey || widget.current || !window.turnstile) return;
      widget.current = window.turnstile.render(el, { sitekey: siteKey, callback: setToken, 'expired-callback': () => setToken(null) });
    },
    [siteKey],
  );
  const [scriptReady, setScriptReady] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setRes(null);
    try {
      const r = await fetch('/api/demo/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, body, sample, token }),
      });
      setRes((await r.json()) as Res);
    } catch {
      setRes({ error: 'Network error — try again.' });
    } finally {
      setPending(false);
      setToken(null);
      window.turnstile?.reset(widget.current ?? undefined); // tokens are single-use
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setScriptReady(true)} />
      <form onSubmit={run} className="space-y-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Sample messages">
          {SAMPLES.map((s) => (
            <Button key={s.key} type="button" variant="outline" size="xs" onClick={() => { setSubject(s.subject); setBody(s.body); setSample(s.key); }}>
              {s.label}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="demo-subject">Subject</Label>
          <Input id="demo-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="demo-body">Customer message</Label>
          <Textarea id="demo-body" value={body} onChange={(e) => { setBody(e.target.value); setSample((k) => (SAMPLES.find((s) => s.key === k)?.body === e.target.value ? k : null)); }} className="min-h-36" maxLength={2000} required />
        </div>
        {siteKey ? (scriptReady && <div ref={mount} />) : <p className="text-sm text-destructive">Demo bot protection is not configured.</p>}
        <Button type="submit" disabled={pending || !token || !body.trim()}>{pending ? 'Running pipeline…' : 'Run the agent (dry run)'}</Button>
        <p className="text-xs text-muted-foreground">
          Fictional shop. Nothing is ever sent. Please don&apos;t type personal information — messages go to a free-tier AI model.
          Limits: 10 live runs per visitor per day.
        </p>
      </form>
      <section aria-live="polite" aria-label="Pipeline trace">
        {!res && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Pick a sample (try “Injection”) and watch every step: redaction, rules, classification, retrieval, draft, validator, and the gate.</p>}
        {res && 'error' in res && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{res.error}</p>}
        {res && 'mode' in res && res.mode === 'unavailable' && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{res.note}</p>}
        {res && 'mode' in res && res.mode === 'live' && <TraceView result={res.result} ms={res.ms} ticketHref={`/demo/tickets/${res.ticketId}`} />}
        {res && 'mode' in res && res.mode === 'replay' && <TraceView result={res.result} note={res.note} ticketHref={res.ticketId ? `/demo/tickets/${res.ticketId}` : '/demo'} />}
      </section>
    </div>
  );
}
