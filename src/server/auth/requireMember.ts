import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Database } from '@/lib/database.types';
import { db } from '@/server/db/admin';
import { userDb } from '@/server/db/user';
import { env } from '@/server/env';

export type Role = Database['public']['Enums']['member_role'];
export type Membership = { userId: string; email: string | null; orgId: string; orgName: string; isDemo: boolean; role: Role };

const RANK: Record<Role, number> = { viewer: 0, reviewer: 1, owner: 2 };
export const hasRole = (have: Role, need: Role) => RANK[have] >= RANK[need];

/** The signed-in user's org (DEFAULT_ORG_SLUG preferred), or null when not a member of any org. Redirects to /login when signed out. */
export const currentMembership = cache(async (): Promise<Membership | null> => {
  const { data } = await (await userDb()).auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect('/login');
  const { data: rows, error } = await db
    .from('org_members')
    .select('role, org:orgs(id, slug, name, is_demo)')
    .eq('user_id', userId);
  if (error) throw error;
  const pick = rows.find((r) => r.org?.slug === env.DEFAULT_ORG_SLUG) ?? rows[0];
  if (!pick?.org) return null;
  const email = typeof data.claims.email === 'string' ? data.claims.email : null;
  return { userId, email, orgId: pick.org.id, orgName: pick.org.name, isDemo: pick.org.is_demo, role: pick.role };
});

/** For dashboard pages: the membership, or 404 (the layout already shows "No access"). Layouts alone don't protect pages. */
export async function requirePageMember(role: Role = 'viewer'): Promise<Membership> {
  const m = await currentMembership();
  if (!m || !hasRole(m.role, role)) notFound();
  return m;
}

/** Gate for every Server Action: throws unless the user has at least `role` in `orgId`. */
export async function requireMember(orgId: string, role: Role): Promise<Membership> {
  const m = await currentMembership();
  if (!m || m.orgId !== orgId || !hasRole(m.role, role)) throw new Error('forbidden');
  return m;
}
