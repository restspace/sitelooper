// Written with sitelooper 0.8.0 from the recorded flow "asset-checkout".
// Plain @playwright/test with no other dependency: edit it like any other test.
import { expect, test, type Locator, type Page } from '@playwright/test';

// The one Node global this file reads, declared so it type-checks without @types/node.
declare const process: { env: Record<string, string | undefined> };

const requiredEnvNames = ["E2E_ADMIN_PASSWORD","E2E_ADMIN_USERNAME"] as const;

export type Vars = { runid: string };
export type Env = Record<(typeof requiredEnvNames)[number], string>;
/** Values the steps publish, keyed "<stepId>.<output>". */
export type Outputs = Record<string, string>;
export interface StepContext { vars: Vars; env: Env; outputs: Outputs }
export interface RunOptions { startUrl?: string }

/** 30 s plus 5 s for each of the flow's 27 recorded actions: with no fallback to try, a run either goes through or stops at its first stuck action. */
export const BUDGET_MS = 165000;
/** The browser the flow was recorded in, applied by the generated .spec.ts with test.use(); a stuck action or navigation fails after 15 s / 30 s, naming its step, instead of using up BUDGET_MS. */
export const RECORDED_USE = {"viewport":{"width":1280,"height":900},"actionTimeout":15000,"navigationTimeout":30000};
/** Where the app was when this flow was recorded: used only when neither startUrl nor the project baseURL says. */
export const RECORDED_ORIGIN = 'http://127.0.0.1:8000';

/** Every input the flow needs, checked before the browser goes anywhere. */
function readInputs(vars: Vars): Env {
  const missing: string[] = [];
  if (!vars.runid?.trim()) missing.push('RUNID');
  for (const name of requiredEnvNames) if (!process.env[name]?.trim()) missing.push(name);
  if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
  return { E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD!, E2E_ADMIN_USERNAME: process.env.E2E_ADMIN_USERNAME! };
}

/** Runs every step in order and returns what they published. */
export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {
  const ctx: StepContext = { vars, env: readInputs(vars), outputs: {} };
  const base = test.info().project.use.baseURL ?? RECORDED_ORIGIN;
  await page.goto(new URL(options.startUrl ?? '/', base).href);
  await test.step('01-signin: Sign in as $E2E_ADMIN_USERNAME with password $E2E_ADMIN_PASSWORD and verify the dashboard opens', () => step01Signin(page, ctx));
  await test.step(`02-create: Create an asset named '${ctx.vars.runid} E2E Laptop' of model 'E2E Laptop Model' with status 'Ready to Deploy', default location 'E2E Office' and purchase date 2026-03-15. Save it, verify its asset page opens, and report its asset tag.`, () => step02Create(page, ctx));
  await test.step(`03-verify: Check out the asset '${ctx.vars.runid} E2E Laptop' to the user 'E2E Assignee' with the note '${ctx.vars.runid} checkout'. Verify the asset's page then shows it is checked out to E2E Assignee.`, () => step03Verify(page, ctx));
  await test.step(`04-assert: the page of the asset '${ctx.vars.runid} E2E Laptop' shows it is checked out to E2E Assignee`, () => step04Assert(page, ctx));
  return ctx.outputs;
}

export const steps = {
  '01-signin': step01Signin,
  '02-create': step02Create,
  '03-verify': step03Verify,
  '04-assert': step04Assert,
};

/** A value an earlier step published; stops the step before it runs when that step did not. */
function need(outputs: Outputs, key: string, by: string): string {
  const value = outputs[key];
  if (!value) throw new Error(`${by} needs ${key} from an earlier step, and this run never published it`);
  return value;
}

/** Opens a path of the app on the origin this run is on (startUrl, or the project baseURL). */
async function visit(page: Page, path: string): Promise<void> {
  await page.goto(new URL(path, page.url()).href);
}

/**
 * Opens a dropdown and chooses an option. The opener's click can land before the page's script has
 * wired the dropdown up, and then nothing opens: it is clicked again until the option shows, but
 * not while a list is already open (a second click would close it).
 */
async function pick(page: Page, opener: Locator, option: Locator): Promise<void> {
  await expect(async () => {
    if (!(await option.isVisible()) && !(await page.getByRole('listbox').or(page.getByRole('menu')).first().isVisible())) await opener.click();
    await expect(option).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await option.click();
}

/** Sign in as $E2E_ADMIN_USERNAME with password $E2E_ADMIN_PASSWORD and verify the dashboard opens */
async function step01Signin(page: Page, { env }: StepContext): Promise<void> {
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(env.E2E_ADMIN_USERNAME);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(env.E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/:\/\/[^/]+\/$/);
  await expect(page.getByText('You have successfully logged in.')).toBeVisible();
}

/** Create an asset named '<runid> E2E Laptop' of model 'E2E Laptop Model' with status 'Ready to Deploy', default location 'E2E Office' and purchase date 2026-03-15. Save it, verify its asset page opens, and report its asset tag. */
async function step02Create(page: Page, { vars, outputs }: StepContext): Promise<void> {
  // recorded as a click on an unlabelled link (div:nth-of-type(2) > ul > li:nth-of-type(9) > ul > li:nth-of-type(1) > a)
  await visit(page, '/hardware/create');
  await page.locator('#optional_info').click();
  await pick(page, page.locator('select[name="model_id"] + .select2-container'), page.getByRole('option', { name: 'E2E Laptops - E2E Manufacturer E2E Laptop Model', exact: true }));
  await pick(page, page.locator('select[name="status_id"] + .select2-container'), page.getByRole('option', { name: 'Ready to Deploy', exact: true }));
  await pick(page, page.locator('select[name="rtd_location_id"] + .select2-container'), page.getByRole('option', { name: 'E2E Office', exact: true }));
  await page.locator('input[name="name"]').fill(`${vars.runid} E2E Laptop`);
  await page.locator('#create-form a:has-text("Order Related Information")').click();
  await page.locator('input[name="purchase_date"]').fill('2026-03-15');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page).toHaveURL(/\/hardware$/);
  await expect(page.getByText('Asset with tag')).toBeVisible();
  await page.locator('div.alert a').click();
  await expect(page).toHaveURL(/\/hardware\/(\d+)$/);
  const hardwareId = page.url().match(/\/hardware\/(\d+)$/)![1];
  outputs['02-create.url.p1'] = hardwareId;
}

/** Check out the asset '<runid> E2E Laptop' to the user 'E2E Assignee' with the note '<runid> checkout'. Verify the asset's page then shows it is checked out to E2E Assignee. */
async function step03Verify(page: Page, { vars, outputs }: StepContext): Promise<void> {
  const hardwareId = need(outputs, '02-create.url.p1', '03-verify');
  await page.locator(`.box-header a[href$="/hardware/${hardwareId}/checkout"]`).click();
  await expect(page).toHaveURL(/\/hardware\/[^/]+\/checkout$/);
  await expect(page.locator('select[name="assigned_user"]')).toBeVisible({ timeout: 8000 });
  await pick(page, page.locator('select[name="assigned_user"] + .select2-container'), page.getByRole('option', { name: 'E2E Assignee (e2e-assignee)', exact: true }));
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill(`${vars.runid} checkout`);
  await page.getByRole('button', { name: 'Checkout', exact: true }).click();
  await expect(page).toHaveURL(/\/hardware$/);
  await expect(page.getByText('Asset checked out successfully.')).toBeVisible();
  await visit(page, `/hardware/${hardwareId}`);
}

/** assert: the page of the asset '<runid> E2E Laptop' shows it is checked out to E2E Assignee */
async function step04Assert(page: Page, { vars }: StepContext): Promise<void> {
  const failed = `assertion failed: the page of the asset '${vars.runid} E2E Laptop' shows it is checked out to E2E Assignee`;
  await expect(page.getByRole('link', { name: 'E2E Assignee', exact: true }), failed).toBeVisible();
  await expect(page.locator('h1'), failed).toContainText(`${vars.runid} E2E Laptop`, { useInnerText: true });
}
