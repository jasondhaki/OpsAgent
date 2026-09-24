// Liveness only: no DB call, no secrets, nothing about tenants.
export function GET() {
  return Response.json({ ok: true });
}
