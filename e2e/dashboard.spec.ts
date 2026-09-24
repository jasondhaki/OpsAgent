import { expect, test } from '@playwright/test';
import { admin, ensureUser, seedReviewTicket, signIn } from './helpers';

const ORG = 'jhunus-crafts';
const OWNER = 'e2e-owner@example.com';
const OUTSIDER = 'e2e-outsider@example.com';

test.beforeAll(async () => {
  await ensureUser(OWNER, ORG, 'owner');
  await ensureUser(OUTSIDER);
});

test('signed-out visitors are sent to /login', async ({ page }) => {
  await page.goto('/queue');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('a signed-in non-member sees no org data', async ({ page, context }) => {
  const { ticketId } = await seedReviewTicket(ORG, `Outsider probe ${Date.now()}`);
  await signIn(context, OUTSIDER);
  await page.goto('/queue');
  await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
  await page.goto(`/tickets/${ticketId}`);
  await expect(page.getByText('The strap came torn')).toHaveCount(0);
});

test('owner edits and approves a draft → human draft version + queued outbox row', async ({ page, context }) => {
  const subject = `Strap torn ${Date.now()}`;
  const { ticketId } = await seedReviewTicket(ORG, subject);
  await signIn(context, OWNER);

  await page.goto('/queue');
  await page.getByRole('link', { name: new RegExp(subject) }).click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${ticketId}$`));
  const gate = page.getByRole('list', { name: 'Gate checks' });
  await expect(gate.getByText('Failed: No risk flags')).toBeAttached();

  await page.getByRole('button', { name: 'Edit & approve' }).click();
  const reply = page.getByRole('textbox', { name: 'Reply' });
  await reply.fill('Sorry! Please send a photo of the strap and we will sort it out.');
  await page.getByRole('button', { name: 'Approve edited reply' }).click();
  await expect(page.getByText('Approved — reply queued for sending.')).toBeVisible();

  await expect(page.getByText('approved', { exact: true }).first()).toBeVisible();
  const { data: outbox } = await admin.from('outbox').select('status, body, reply_to_provider_message_id').eq('ticket_id', ticketId);
  expect(outbox).toEqual([{ status: 'queued', body: 'Sorry! Please send a photo of the strap and we will sort it out.', reply_to_provider_message_id: 'gm-e2e' }]);
  const { data: drafts } = await admin.from('drafts').select('version, author').eq('ticket_id', ticketId).order('version');
  expect(drafts).toEqual([{ version: 1, author: 'ai' }, { version: 2, author: 'human' }]);
  // Timeline shows who did it.
  await expect(page.getByText(/^approved$/i).last()).toBeVisible();
  await expect(page.getByText(/by user:/).first()).toBeVisible();
});

test('owner rejects with a reason; no outbox row', async ({ page, context }) => {
  const { ticketId } = await seedReviewTicket(ORG, `Reject me ${Date.now()}`);
  await signIn(context, OWNER);
  await page.goto(`/tickets/${ticketId}`);
  await page.getByRole('textbox', { name: /Reject/ }).fill('Handled by phone');
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('Rejected.')).toBeVisible();
  expect((await admin.from('tickets').select('status').eq('id', ticketId).single()).data?.status).toBe('rejected');
  expect((await admin.from('outbox').select('id').eq('ticket_id', ticketId)).data).toEqual([]);
});

test('settings: auto-send cannot be switched on without the confirmation box', async ({ page, context }) => {
  await signIn(context, OWNER);
  await page.goto('/settings');
  await page.getByRole('checkbox', { name: /Master switch/ }).check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Tick the confirmation box to turn auto-send on.')).toBeVisible();
  const { data: org } = await admin.from('orgs').select('settings').eq('slug', ORG).single();
  expect((org!.settings as { autosendEnabled?: boolean }).autosendEnabled ?? false).toBe(false);
});

test('KB: a document with placeholders cannot be activated', async ({ page, context }) => {
  await signIn(context, OWNER);
  await page.goto('/kb?doc=new');
  const title = `E2E doc ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('textbox', { name: 'Content (markdown)' }).fill('Delivery inside Dhaka costs {{DELIVERY_FEE_DHAKA}}.');
  await expect(page.getByText(/1 placeholder\(s\) left/)).toBeVisible();
  await page.getByRole('checkbox', { name: /Active/ }).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Fill these before activating: \{\{DELIVERY_FEE_DHAKA\}\}/)).toBeVisible();
  await page.getByRole('checkbox', { name: /Active/ }).uncheck();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/Saved — inactive/)).toBeVisible();
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});

// Uses real models + quota: opt in with E2E_REAL_LLM=1.
test('simulator: real pipeline dry run → ticket in queue → approve records a cancelled (never-sent) outbox row', async ({ page, context }, info) => {
  test.skip(process.env.E2E_REAL_LLM !== '1' || info.project.name !== 'desktop', 'set E2E_REAL_LLM=1 (desktop only)');
  test.setTimeout(180_000);
  await signIn(context, OWNER);
  await page.goto('/simulator');
  await page.getByRole('button', { name: 'Angry' }).click();
  await page.getByRole('button', { name: 'Run (dry run)' }).click();
  await expect(page.getByText('Open ticket →')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/would auto-send: no/)).toBeVisible();
  await page.getByText('Open ticket →').click();
  await page.waitForURL(/\/tickets\/[0-9a-f-]{36}$/);
  const ticketId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Approve as is' }).click();
  await expect(page.getByText(/simulator ticket, so the outbox row is recorded but never sent/)).toBeVisible();
  const { data: outbox } = await admin.from('outbox').select('status').eq('ticket_id', ticketId);
  expect(outbox).toEqual([{ status: 'cancelled' }]);
});
