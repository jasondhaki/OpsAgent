import 'server-only';
import type { Db } from '@/server/db/admin';

const today = () => new Date().toISOString().slice(0, 10); // provider quotas reset on UTC days

/** False when today's cap is reached or the provider is cooling down after a 429. */
export async function hasBudget(db: Db, provider: string, model: string, dailyCap: number): Promise<boolean> {
  const { data, error } = await db
    .from('provider_usage')
    .select('requests, cooldown_until')
    .eq('provider', provider)
    .eq('model', model)
    .eq('day', today())
    .maybeSingle();
  if (error) throw error;
  if (!data) return true;
  if (data.cooldown_until && new Date(data.cooldown_until) > new Date()) return false;
  return data.requests < dailyCap;
}

export async function recordRequest(db: Db, provider: string, model: string): Promise<void> {
  const { error } = await db.rpc('increment_provider_usage', { p_provider: provider, p_model: model });
  if (error) throw error;
}

export async function setCooldown(db: Db, provider: string, model: string, seconds: number): Promise<void> {
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  const { error } = await db
    .from('provider_usage')
    .upsert({ provider, model, day: today(), cooldown_until: until }, { onConflict: 'provider,model,day' });
  if (error) throw error;
}
