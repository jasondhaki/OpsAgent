'use client';

import { useActionState, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { approveAction, regenerateAction, rejectAction, saveAnswerAction, type ActionState } from './actions';

function useToastAction(action: (s: ActionState, f: FormData) => Promise<ActionState>, onOk?: () => void) {
  const [state, run, pending] = useActionState(action, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      onOk?.();
    } else toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per result
  }, [state]);
  return [run, pending] as const;
}

export function ReviewPanel(p: { ticketId: string; draftId: string | null; draftBody: string; status: string; canReview: boolean; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(p.draftBody);
  const [approve, approving] = useToastAction(approveAction, () => setOpen(false));
  const [reject, rejecting] = useToastAction(rejectAction);
  const [regenerate, regenerating] = useToastAction(regenerateAction);
  const [saveAnswer, saving] = useToastAction(saveAnswerAction);

  const reviewable = p.canReview && (p.status === 'needs_review' || p.status === 'error');

  return (
    <div className="space-y-3">
      {reviewable && p.status === 'needs_review' && p.draftId && (
        <div className="flex flex-wrap gap-2">
          <form action={approve}>
            <input type="hidden" name="ticketId" value={p.ticketId} />
            <input type="hidden" name="draftId" value={p.draftId} />
            <Button type="submit" disabled={approving}>{approving ? 'Approving…' : 'Approve as is'}</Button>
          </form>
          <Sheet
            open={open}
            onOpenChange={(o) => {
              if (o) setBody(p.draftBody); // start from the latest draft each time the drawer opens
              setOpen(o);
            }}
          >
            <SheetTrigger render={<Button variant="outline">Edit & approve</Button>} />
            <SheetContent side="right" className="w-full sm:max-w-lg">
              <form action={approve} className="flex h-full flex-col">
                <SheetHeader>
                  <SheetTitle>Edit reply</SheetTitle>
                  <SheetDescription>Your edit is saved as a new version and sent instead of the AI draft.</SheetDescription>
                </SheetHeader>
                <div className="flex-1 px-4">
                  <input type="hidden" name="ticketId" value={p.ticketId} />
                  <input type="hidden" name="draftId" value={p.draftId} />
                  <Label htmlFor="body" className="sr-only">Reply</Label>
                  <Textarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} className="h-[55vh]" maxLength={4000} />
                </div>
                <SheetFooter>
                  <Button type="submit" disabled={approving || !body.trim()}>{approving ? 'Approving…' : 'Approve edited reply'}</Button>
                </SheetFooter>
              </form>
            </SheetContent>
          </Sheet>
        </div>
      )}

      {reviewable && (
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={regenerate} className="space-y-2 rounded-xl border p-3">
            <input type="hidden" name="ticketId" value={p.ticketId} />
            <Label htmlFor="instruction">Regenerate with an instruction (optional)</Label>
            <Textarea id="instruction" name="instruction" maxLength={500} placeholder="e.g. Ask which colour they want" />
            <Button type="submit" variant="outline" size="sm" disabled={regenerating}>{regenerating ? 'Regenerating…' : 'Regenerate'}</Button>
          </form>
          <form action={reject} className="space-y-2 rounded-xl border p-3">
            <input type="hidden" name="ticketId" value={p.ticketId} />
            <Label htmlFor="reason">Reject (no reply is sent)</Label>
            <Textarea id="reason" name="reason" required maxLength={500} placeholder="Reason, e.g. handled by phone" />
            <Button type="submit" variant="destructive" size="sm" disabled={rejecting}>{rejecting ? 'Rejecting…' : 'Reject'}</Button>
          </form>
        </div>
      )}

      {p.isOwner && (p.status === 'approved' || p.status === 'sent') && (
        <form action={saveAnswer}>
          <input type="hidden" name="ticketId" value={p.ticketId} />
          <Button type="submit" variant="secondary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save as approved answer (adds to knowledge base)'}
          </Button>
        </form>
      )}
    </div>
  );
}
