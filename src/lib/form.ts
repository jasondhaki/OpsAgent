import { startTransition, type FormEvent } from 'react';

/**
 * Submit a form to a useActionState action without React 19's automatic form reset,
 * so a validation error doesn't wipe what the user typed. Use as `onSubmit`.
 */
export const submitKeepingValues = (action: (form: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  startTransition(() => action(form));
};
