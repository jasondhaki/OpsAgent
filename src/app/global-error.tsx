'use client';

// Replaces the root layout when it crashes, so it can't rely on globals.css.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '15vh auto', padding: '0 16px', lineHeight: 1.5 }}>
        <title>OpsAgent — error</title>
        <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
        <p style={{ color: '#666' }}>
          The error was logged{error.digest ? ` (${error.digest})` : ''}. Nothing was sent to any customer.
        </p>
        <button onClick={retry} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', background: 'transparent', cursor: 'pointer' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
