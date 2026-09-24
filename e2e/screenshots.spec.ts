import { test } from '@playwright/test';
import type { Database } from '../src/lib/database.types';
import { admin } from './helpers';

// README screenshots from the public demo (fictional data only). Opt-in: SCREENSHOTS=1 pnpm e2e screenshots --project=desktop
test.skip(process.env.SCREENSHOTS !== '1', 'set SCREENSHOTS=1');
test.setTimeout(120_000);

test('capture README screenshots', async ({ page }) => {
  const { data: demo } = await admin.from('orgs').select('id').eq('slug', 'demo').single();
  const pick = async (intent: Database['public']['Enums']['ticket_intent']) =>
    (await admin.from('tickets').select('id').eq('org_id', demo!.id).eq('intent', intent).neq('channel', 'simulator').order('created_at', { ascending: false }).limit(1).single()).data!.id;

  await page.setViewportSize({ width: 1280, height: 900 });
  const hideDevBadge = () => page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.goto('/demo');
  await hideDevBadge();
  await page.screenshot({ path: 'docs/screenshots/demo.png' });

  await page.getByRole('button', { name: 'Injection' }).click();
  await page.getByRole('button', { name: 'Run the agent (dry run)' }).click({ timeout: 30_000 });
  await page.getByText('Open ticket →').waitFor({ timeout: 90_000 });
  await page.getByRole('region', { name: 'Pipeline trace' }).screenshot({ path: 'docs/screenshots/trace.png' });

  await page.goto(`/demo/tickets/${await pick('custom_bulk_order')}`);
  await hideDevBadge();
  await page.screenshot({ path: 'docs/screenshots/ticket-gate.png', fullPage: true });

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`/demo/tickets/${await pick('complaint_return')}`);
  await hideDevBadge();
  await page.screenshot({ path: 'docs/screenshots/mobile.png' });
});
