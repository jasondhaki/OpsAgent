import { Button } from '@/components/ui/button';
import { signInWithGoogle } from './actions';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">OpsAgent</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to review replies before they go out.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Sign-in failed. Try again.
        </p>
      )}
      <form action={signInWithGoogle}>
        <Button type="submit" size="lg" className="w-full">
          Continue with Google
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">Only invited team members can see the dashboard.</p>
    </main>
  );
}
