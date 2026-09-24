export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3 py-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
