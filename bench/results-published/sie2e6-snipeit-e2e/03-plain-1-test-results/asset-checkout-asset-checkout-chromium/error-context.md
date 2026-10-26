# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: asset-checkout.spec.ts >> asset-checkout
- Location: specs/asset-checkout.spec.ts:9:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('option', { name: 'E2E Laptops - E2E Manufacturer E2E Laptop Model', exact: true })
Expected: visible
Timeout: 3000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('option', { name: 'E2E Laptops - E2E Manufacturer E2E Laptop Model', exact: true }) with timeout 3000ms
  - waiting for getByRole('option', { name: 'E2E Laptops - E2E Manufacturer E2E Laptop Model', exact: true })


Call Log:
- Timeout 30000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=f2e1]:
  - link "Skip to main content" [ref=f2e2] [cursor=pointer]:
    - /url: "#main"
  - generic [ref=f2e3]:
    - banner [ref=f2e4]:
      - navigation [ref=f2e5]:
        - button " Toggle navigation" [ref=f2e6] [cursor=pointer]:
          - text: 
          - generic [ref=f2e7]: Toggle navigation
        - link "Snipe-IT E2E" [ref=f2e10] [cursor=pointer]:
          - /url: http://127.0.0.1:8000
        - list [ref=f2e12]:
          - text: 
          - listitem [aria-hidden] [ref=f2e13]:
            - link [ref=f2e14] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/hardware
              - generic [aria-hidden] [ref=f2e15]: 
              - generic [ref=f2e16]: Assets
          - listitem [aria-hidden] [ref=f2e17]:
            - link [ref=f2e18] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/licenses
              - generic [aria-hidden] [ref=f2e19]: 
              - generic [ref=f2e20]: Licenses
          - listitem [aria-hidden] [ref=f2e21]:
            - link [ref=f2e22] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/accessories
              - generic [aria-hidden] [ref=f2e23]: 
              - generic [ref=f2e24]: Accessories
          - listitem [aria-hidden] [ref=f2e25]:
            - link [ref=f2e26] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/consumables
              - generic [aria-hidden] [ref=f2e27]: 
              - generic [ref=f2e28]: Consumables
          - listitem [aria-hidden] [ref=f2e29]:
            - link [ref=f2e30] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/components
              - generic [aria-hidden] [ref=f2e31]: 
              - generic [ref=f2e32]: Components
          - listitem [aria-hidden] [ref=f2e33]:
            - link [ref=f2e34] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/users
              - generic [aria-hidden] [ref=f2e35]: 
              - generic [ref=f2e36]: Users
          - listitem [ref=f2e37]:
            - search [ref=f2e38]:
              - generic [ref=f2e39]:
                - generic [ref=f2e40]: Lookup by Asset Tag
                - textbox "Lookup by Asset Tag" [ref=f2e41]
                - button "Search" [ref=f2e43] [cursor=pointer]:
                  - generic [aria-hidden] [ref=f2e44]: 
          - listitem [aria-hidden] [ref=f2e46]:
            - link [ref=f2e47] [cursor=pointer]:
              - /url: "#"
              - text: Create New
              - strong [ref=f2e48]
            - text:      
          - listitem [ref=f2e49]:
            - link "Alerts" [ref=f2e50] [cursor=pointer]:
              - /url: "#"
              - generic [aria-hidden] [ref=f2e51]: 
          - listitem [ref=f2e53]:
            - link [ref=f2e54] [cursor=pointer]:
              - /url: "#"
              - generic [ref=f2e55]:
                - text: E2E Admin
                - strong [ref=f2e56]
            - text:        
          - listitem [ref=f2e57]:
            - link "Admin Settings" [ref=f2e58] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/admin
              - generic [aria-hidden] [ref=f2e59]: 
    - complementary [ref=f2e61]:
      - list [ref=f2e63]:
        - listitem [ref=f2e64]:
          - link [ref=f2e65] [cursor=pointer]:
            - /url: http://127.0.0.1:8000
            - generic [aria-hidden] [ref=f2e66]: 
        - listitem [ref=f2e67]:
          - link [ref=f2e68] [cursor=pointer]:
            - /url: "#"
            - generic [aria-hidden] [ref=f2e69]: 
            - text: 
          - text:           
        - listitem [ref=f2e70]:
          - link [ref=f2e71] [cursor=pointer]:
            - /url: "#"
            - generic [aria-hidden] [ref=f2e72]: 
            - text: 
          - text:  
        - listitem [ref=f2e73]:
          - link [ref=f2e74] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/licenses
            - generic [aria-hidden] [ref=f2e75]: 
        - listitem [ref=f2e76]:
          - link [ref=f2e77] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/accessories
            - generic [aria-hidden] [ref=f2e78]: 
        - listitem [ref=f2e79]:
          - link [ref=f2e80] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/consumables
            - generic [aria-hidden] [ref=f2e81]: 
        - listitem [ref=f2e82]:
          - link [ref=f2e83] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/components
            - generic [aria-hidden] [ref=f2e84]: 
        - listitem [ref=f2e85]:
          - link [ref=f2e86] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/kits
            - generic [aria-hidden] [ref=f2e87]: 
        - listitem [ref=f2e88]:
          - link [ref=f2e89] [cursor=pointer]:
            - /url: "#"
            - generic [aria-hidden] [ref=f2e90]: 
            - text: 
          - text:       
        - listitem [ref=f2e91]:
          - link [ref=f2e92] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/calendar
            - generic [aria-hidden] [ref=f2e93]: 
        - listitem [ref=f2e94]:
          - link [ref=f2e95] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/import
            - generic [aria-hidden] [ref=f2e96]: 
        - listitem [ref=f2e97]:
          - link [ref=f2e98] [cursor=pointer]:
            - /url: "#"
            - generic [aria-hidden] [ref=f2e99]: 
            - text: 
        - listitem [ref=f2e100]:
          - link [ref=f2e101] [cursor=pointer]:
            - /url: "#"
            - generic [aria-hidden] [ref=f2e102]: 
            - text: 
        - listitem [ref=f2e103]:
          - link [ref=f2e104] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/requests
            - generic [aria-hidden] [ref=f2e105]: 
        - listitem [ref=f2e106]:
          - link [ref=f2e107] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/unaccepted-acceptances
            - generic [aria-hidden] [ref=f2e108]: 
        - listitem [ref=f2e109]:
          - link [ref=f2e110] [cursor=pointer]:
            - /url: http://127.0.0.1:8000/account/requestable
            - generic [aria-hidden] [ref=f2e111]: 
    - main [ref=f2e112]:
      - heading [level=1] [ref=f2e116]:
        - list [ref=f2e117]:
          - listitem [ref=f2e118]:
            - link [ref=f2e119] [cursor=pointer]:
              - /url: http://127.0.0.1:8000
              - generic [aria-hidden] [ref=f2e120]: 
            - generic [aria-hidden] [ref=f2e121]: 
          - listitem [ref=f2e122]:
            - link "Assets" [ref=f2e123] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/hardware
            - generic [aria-hidden] [ref=f2e124]: 
          - listitem [ref=f2e125]: Create New
      - form [ref=f2e130]:
        - generic [ref=f2e131]:
          - button "Save" [ref=f2e136] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e137]: 
            - text: Save
          - generic [ref=f2e138]:
            - generic [ref=f2e139]:
              - generic [ref=f2e140]: Company
              - generic [ref=f2e141]:
                - combobox [aria-hidden] [ref=f2e142]
                - combobox [ref=f2e145] [cursor=pointer]:
                  - textbox [ref=f2e146]
              - link "Create New" [ref=f2e148] [cursor=pointer]:
                - /url: http://127.0.0.1:8000/modals/company
                - generic [aria-hidden] [ref=f2e149]: +
            - generic [ref=f2e151]:
              - generic [ref=f2e152]: Asset Tag
              - textbox "Asset Tag" [ref=f2e154]: E2E-00005
              - button "new!" [ref=f2e156] [cursor=pointer]:
                - generic [aria-hidden] [ref=f2e157]: +
            - generic [ref=f2e159]:
              - generic [ref=f2e160]: Serial
              - textbox [ref=f2e162]
            - generic [ref=f2e165]:
              - generic [ref=f2e166]: Model
              - generic [ref=f2e167]:
                - combobox [aria-hidden] [ref=f2e168]
                - combobox [expanded] [ref=f2e171] [cursor=pointer]:
                  - textbox [ref=f2e172]
                  - listbox [expanded] [ref=f2e173]:
                    - alert [ref=f2e174]: The results could not be loaded.
              - generic [ref=f2e175]:
                - link "Create New" [ref=f2e176] [cursor=pointer]:
                  - /url: http://127.0.0.1:8000/modals/model
                  - generic [aria-hidden] [ref=f2e177]: +
                - text: 
            - generic [ref=f2e179]:
              - generic [ref=f2e180]: Status
              - generic [ref=f2e181]:
                - combobox [aria-hidden] [ref=f2e182]
                - combobox [ref=f2e185] [cursor=pointer]:
                  - textbox [ref=f2e186]
              - generic [ref=f2e187]:
                - link "Create New" [ref=f2e188] [cursor=pointer]:
                  - /url: http://127.0.0.1:8000/modals/statuslabel
                  - generic [aria-hidden] [ref=f2e189]: +
                - text: 
            - text:    + +
            - generic [ref=f2e191]:
              - generic [ref=f2e192]: Notes
              - textbox "notes" [ref=f2e194]
            - generic [ref=f2e197]:
              - generic [ref=f2e198]: Location
              - generic [ref=f2e199]:
                - combobox [aria-hidden] [ref=f2e200]
                - combobox [ref=f2e203] [cursor=pointer]:
                  - textbox [ref=f2e204]
              - link "Create New" [ref=f2e206] [cursor=pointer]:
                - /url: http://127.0.0.1:8000/modals/location
                - generic [aria-hidden] [ref=f2e207]: +
              - paragraph [ref=f2e210]: If left blank, the location will be updated to match the location of whoever (or wherever) this asset is checked out to.
            - generic [ref=f2e211]:
              - generic [ref=f2e212]: Default Location
              - generic [ref=f2e213]:
                - combobox [aria-hidden] [ref=f2e214]
                - combobox [ref=f2e217] [cursor=pointer]:
                  - textbox [ref=f2e218]
              - link "Create New" [ref=f2e220] [cursor=pointer]:
                - /url: http://127.0.0.1:8000/modals/location
                - generic [aria-hidden] [ref=f2e221]: +
              - paragraph [ref=f2e224]: This is the location of the asset when it is not checked out
            - generic [ref=f2e227]:
              - checkbox "requestable" [ref=f2e228]
              - text: Requestable
            - generic [ref=f2e229]:
              - generic [ref=f2e230]: Upload Image
              - generic [ref=f2e231]:
                - button "image" [ref=f2e232]
                - generic [aria-hidden] [ref=f2e233] [cursor=pointer]: Select File...
                - paragraph [ref=f2e234]: Accepted filetypes are jpg, webp, png, gif, svg, and avif. The maximum upload size allowed is 2M.
            - group [ref=f2e240]:
              - heading [level=4] [ref=f2e242]:
                - generic [ref=f2e243] [cursor=pointer]:
                  - generic [aria-hidden] [ref=f2e244]: 
                  - text: Optional Information
              - generic [ref=f2e245]:
                - generic [ref=f2e246]:
                  - generic [ref=f2e247]: Asset Name
                  - textbox "name" [ref=f2e249]
                - generic [ref=f2e252]:
                  - generic [ref=f2e253]: Warranty
                  - generic [ref=f2e255]:
                    - textbox "Warranty" [ref=f2e256]
                    - generic [ref=f2e257]: months
                - generic [ref=f2e260]:
                  - generic [ref=f2e261]: Expected Checkin Date
                  - generic [ref=f2e263]:
                    - textbox "Expected Checkin Date" [ref=f2e264]:
                      - /placeholder: Select Date and Time (YYYY-MM-DD HH:MM:SS)
                    - generic [aria-hidden] [ref=f2e266] [cursor=pointer]: 
                - generic [ref=f2e268]:
                  - generic [ref=f2e269]: Next Audit Date
                  - generic [ref=f2e271]:
                    - textbox "Next Audit Date" [ref=f2e272]:
                      - /placeholder: Select Date (YYYY-MM-DD)
                    - generic [aria-hidden] [ref=f2e274] [cursor=pointer]: 
                - paragraph [ref=f2e278]:
                  - text: If you use auditing in your organization, this is usually automatically calculated based on the asset's last audit date and audit frequency (in
                  - code [ref=f2e279]: Admin Settings > Alerts
                  - text: ) and you can leave this blank. You can manually set this date here if you need to, but it must be later than the last audit date.
                - generic [ref=f2e280]:
                  - generic [ref=f2e282]:
                    - checkbox "byod" [ref=f2e283]
                    - text: BYOD
                  - paragraph [ref=f2e285]: This device is owned by the user
            - group [ref=f2e287]:
              - heading [level=4] [ref=f2e289]:
                - generic [ref=f2e290] [cursor=pointer]:
                  - generic [aria-hidden] [ref=f2e291]: 
                  - text: Order Related Information
              - text:   +
          - generic [ref=f2e293]:
            - link "Cancel" [ref=f2e295] [cursor=pointer]:
              - /url: http://127.0.0.1:8000/hardware
            - generic [ref=f2e297]:
              - combobox [aria-hidden] [ref=f2e298]
              - combobox [ref=f2e301] [cursor=pointer]:
                - textbox [ref=f2e302]
              - button "Save" [ref=f2e303] [cursor=pointer]:
                - generic [aria-hidden] [ref=f2e304]: 
                - text: Save
    - contentinfo [ref=f2e305]:
      - generic [ref=f2e306]:
        - generic [ref=f2e307]:
          - link "Snipe-IT" [ref=f2e308] [cursor=pointer]:
            - /url: https://snipeitapp.com
          - text: is open source software, made with
          - generic [aria-hidden] [ref=f2e309]: 
          - generic [ref=f2e310]: love
          - text: by Grokability, Inc.
          - link "" [ref=f2e311] [cursor=pointer]:
            - /url: https://bsky.app/profile/snipeitapp.com
          - link "" [ref=f2e313] [cursor=pointer]:
            - /url: https://github.com/grokability/snipe-it/
          - link "" [ref=f2e315] [cursor=pointer]:
            - /url: https://hachyderm.io/@grokability
          - link "" [ref=f2e317] [cursor=pointer]:
            - /url: https://discord.gg/yZFtShAcKk
        - generic [ref=f2e319]:
          - text: Version v8.8.3 - build 26143 (master)
          - link "User's Manual" [ref=f2e320] [cursor=pointer]:
            - /url: https://snipe-it.readme.io/docs/overview
          - link "Report a bug" [ref=f2e321] [cursor=pointer]:
            - /url: https://snipeitapp.com/support/
  - searchbox [active] [ref=f2e324]
```

# Test source

```ts
  1   | // Generated by sitelooper 0.7.0 from flow "asset-checkout" (readable style) — regenerate, don't edit:
  2   | //   sitelooper compile asset-checkout --style readable
  3   | // @sitelooper-readable v1
  4   | // @sitelooper-source {"flow":"asset-checkout","bundle":"../.sitelooper/procedures.json","specHash":"6dca6db5318c6df5490dec96cc05f8c4f40619aedaf25135c781f59e1395ab43"}
  5   | import { expect, test, type Locator, type Page } from '@playwright/test';
  6   | 
  7   | // The one Node global this file reads, declared so it type-checks without @types/node.
  8   | declare const process: { env: Record<string, string | undefined> };
  9   | 
  10  | export const flowStepIds = ["01-signin","02-create","03-verify","04-assert"] as const;
  11  | export const requiredInputNames = ["runid"] as const;
  12  | export const requiredEnvNames = ["E2E_ADMIN_PASSWORD","E2E_ADMIN_USERNAME"] as const;
  13  | export const assertStepIds = ["04-assert"] as const;
  14  | 
  15  | export type Vars = { runid: string };
  16  | export type Env = Record<(typeof requiredEnvNames)[number], string>;
  17  | /** Values the steps publish, keyed "<stepId>.<output>". */
  18  | export type Outputs = Record<string, string>;
  19  | export interface StepContext { vars: Vars; env: Env; outputs: Outputs }
  20  | /** The runtime style's run record, kept so an existing .spec.ts compiles unchanged; this style never drifts. */
  21  | export interface FlowRun { drift: string[]; warnings: string[]; echoed: string[] }
  22  | export interface RunOptions { startUrl?: string; run?: FlowRun }
  23  | 
  24  | /** 30 s plus 5 s for each of the flow's 32 recorded actions: with no fallback to try, a run either goes through or stops at its first stuck action. */
  25  | export const BUDGET_MS = 190000;
  26  | /** The browser the flow was recorded in, applied by the generated .spec.ts with test.use(); a stuck action or navigation fails after 15 s / 30 s, naming its step, instead of using up BUDGET_MS. */
  27  | export const RECORDED_USE = {"viewport":{"width":1280,"height":900},"actionTimeout":15000,"navigationTimeout":30000};
  28  | /** Where the app was when this flow was recorded: used only when neither startUrl nor the project baseURL says. */
  29  | export const RECORDED_ORIGIN = 'http://127.0.0.1:8000';
  30  | 
  31  | export function createFlowRun(): FlowRun {
  32  |   return { drift: [], warnings: [], echoed: [] };
  33  | }
  34  | 
  35  | /** Every input the flow needs, checked before the browser goes anywhere. */
  36  | function readInputs(vars: Vars): Env {
  37  |   const missing: string[] = [];
  38  |   if (!vars.runid?.trim()) missing.push('RUNID');
  39  |   for (const name of requiredEnvNames) if (!process.env[name]?.trim()) missing.push(name);
  40  |   if (missing.length) throw new Error(`missing required flow input${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
  41  |   return { E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD!, E2E_ADMIN_USERNAME: process.env.E2E_ADMIN_USERNAME! };
  42  | }
  43  | 
  44  | /** Runs every step in order and returns what they published. */
  45  | export async function runFlow(page: Page, vars: Vars, options: RunOptions = {}): Promise<Outputs> {
  46  |   const ctx: StepContext = { vars, env: readInputs(vars), outputs: {} };
  47  |   const base = test.info().project.use.baseURL ?? RECORDED_ORIGIN;
  48  |   await page.goto(new URL(options.startUrl ?? '/', base).href);
  49  |   await test.step('01-signin: Sign in as {{env:E2E_ADMIN_USERNAME}} with password {{env:E2E_ADMIN_PASSWORD}} and verify the dashboard opens', () => step01Signin(page, ctx));
  50  |   console.log('[sitelooper step] 01-signin');
  51  |   await test.step('02-create: Create an asset named \'{{runid}} E2E Laptop\' of model \'E2E Laptop Model\' with status \'Ready to Deploy\', default location \'E2E Office\' and purchase date 2026-03-15. Save it, verify its asset page opens, and report its asset tag.', () => step02Create(page, ctx));
  52  |   console.log('[sitelooper step] 02-create');
  53  |   await test.step('03-verify: Check out the asset \'{{runid}} E2E Laptop\' to the user \'E2E Assignee\' with the note \'{{runid}} checkout\'. Verify the asset\'s page then shows it is checked out to E2E Assignee.', () => step03Verify(page, ctx));
  54  |   console.log('[sitelooper step] 03-verify');
  55  |   await test.step('04-assert: the page of the asset \'{{runid}} E2E Laptop\' shows it is checked out to E2E Assignee', () => step04Assert(page, ctx));
  56  |   console.log('[sitelooper step] 04-assert');
  57  |   return ctx.outputs;
  58  | }
  59  | 
  60  | export const steps = {
  61  |   '01-signin': step01Signin,
  62  |   '02-create': step02Create,
  63  |   '03-verify': step03Verify,
  64  |   '04-assert': step04Assert,
  65  | };
  66  | 
  67  | /** A value an earlier step published; stops the step before it runs when that step did not. */
  68  | function need(outputs: Outputs, key: string, by: string): string {
  69  |   const value = outputs[key];
  70  |   if (!value) throw new Error(`${by} needs {{${key}}}, and this run never published it`);
  71  |   return value;
  72  | }
  73  | 
  74  | /** Opens a path of the app on the origin this run is on (startUrl, or the project baseURL). */
  75  | async function visit(page: Page, path: string): Promise<void> {
  76  |   await page.goto(new URL(path, page.url()).href);
  77  | }
  78  | 
  79  | /**
  80  |  * Opens a dropdown and chooses an option. The opener's click can land before the page's script has
  81  |  * wired the dropdown up, and then nothing opens: it is clicked again until the option shows — but
  82  |  * not while a list is already open (a second click would close it), and a typed search is typed again.
  83  |  */
  84  | async function pick(page: Page, opener: Locator, option: Locator, typed?: { search: Locator; text: string; delay?: number }): Promise<void> {
  85  |   await expect(async () => {
  86  |     if (!(await option.isVisible())) {
  87  |       if (typed) {
  88  |         if (!(await typed.search.isVisible())) await opener.click();
  89  |         if (typed.delay === undefined) await typed.search.fill(typed.text);
  90  |         else await typed.search.fill('').then(() => typed.search.pressSequentially(typed.text, { delay: typed.delay }));
  91  |       } else if (!(await page.getByRole('listbox').or(page.getByRole('menu')).first().isVisible())) await opener.click();
  92  |     }
  93  |     await expect(option).toBeVisible({ timeout: 3_000 });
> 94  |   }).toPass({ timeout: 30_000 });
      |      ^ Error: expect(locator).toBeVisible() failed
  95  |   await option.click();
  96  | }
  97  | 
  98  | /** Sign in as {{env:E2E_ADMIN_USERNAME}} with password {{env:E2E_ADMIN_PASSWORD}} and verify the dashboard opens */
  99  | async function step01Signin(page: Page, { env, outputs }: StepContext): Promise<void> {
  100 |   // s_6e55ea — recorded on /login
  101 |   // @step 01-signin s_6e55ea/1
  102 |   await page.getByRole('textbox', { name: 'Username', exact: true }).fill(env.E2E_ADMIN_USERNAME);
  103 |   // @step 01-signin s_6e55ea/2
  104 |   await page.getByRole('textbox', { name: 'Password', exact: true }).fill(env.E2E_ADMIN_PASSWORD);
  105 |   // @step 01-signin s_6e55ea/3
  106 |   await page.getByRole('button', { name: 'Login', exact: true }).click();
  107 |   await expect(page).toHaveURL(/:\/\/[^/]+\/$/);
  108 |   await expect(page.getByText('You have successfully logged in.')).toBeVisible();
  109 |   // s_a80fb4 — recorded on /
  110 |   // @step 01-signin s_a80fb4/1
  111 |   outputs['01-signin.dashboard_heading'] = (await page.getByRole('heading', { name: 'Dashboard', exact: true }).innerText()).trim();
  112 |   // @step 01-signin s_a80fb4/2
  113 |   outputs['01-signin.final_url'] = page.url();
  114 | }
  115 | 
  116 | /** Create an asset named '{{runid}} E2E Laptop' of model 'E2E Laptop Model' with status 'Ready to Deploy', default location 'E2E Office' and purchase date 2026-03-15. Save it, verify its asset page opens, and report its asset tag. */
  117 | async function step02Create(page: Page, { vars, outputs }: StepContext): Promise<void> {
  118 |   // s_50255e — recorded on /hardware
  119 |   // @step 02-create s_50255e/4
  120 |   // recorded as a click on an unlabelled link (div:nth-of-type(2) > ul > li:nth-of-type(9) > ul > li:nth-of-type(1) > a)
  121 |   await visit(page, '/hardware/create');
  122 |   // s_bfea11 — recorded on /hardware/create
  123 |   // @step 02-create s_bfea11/1
  124 |   await page.locator('#optional_info').click();
  125 |   // @step 02-create s_bfea11/2
  126 |   // @step 02-create s_bfea11/3
  127 |   await pick(page, page.locator('.select2-container').nth(1), page.getByRole('option', { name: 'E2E Laptops - E2E Manufacturer E2E Laptop Model', exact: true }));
  128 |   // @step 02-create s_bfea11/4
  129 |   // @step 02-create s_bfea11/5
  130 |   await pick(page, page.locator('.select2-container').nth(2), page.getByRole('option', { name: 'Ready to Deploy', exact: true }));
  131 |   // @step 02-create s_bfea11/6
  132 |   // @step 02-create s_bfea11/7
  133 |   await pick(page, page.locator('.select2-container').nth(7), page.getByRole('option', { name: 'E2E Office', exact: true }));
  134 |   // @step 02-create s_bfea11/8
  135 |   await page.locator('input[name="name"]').fill(`${vars.runid} E2E Laptop`);
  136 |   // @step 02-create s_bfea11/9
  137 |   await page.locator('#create-form a:has-text("Order Related Information")').click();
  138 |   // @step 02-create s_bfea11/10
  139 |   await page.locator('input[name="purchase_date"]').fill('2026-03-15');
  140 |   // @step 02-create s_bfea11/13
  141 |   await page.keyboard.press('Escape');
  142 |   // @step 02-create s_bfea11/14
  143 |   await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  144 |   await expect(page).toHaveURL(/\/hardware$/);
  145 |   await expect(page.getByText('Asset with tag')).toBeVisible();
  146 |   // s_6358f4 — recorded on /hardware
  147 |   // @step 02-create s_6358f4/1
  148 |   await page.locator('div.alert a').click();
  149 |   await expect(page).toHaveURL(/\/hardware\/(\d+)$/);
  150 |   const hardwareId = page.url().match(/\/hardware\/(\d+)$/)![1];
  151 |   outputs['02-create.minted'] = hardwareId; // the record this step created
  152 |   // s_00f59d — recorded on /hardware/<hardwareId>
  153 |   // @step 02-create s_00f59d/1
  154 |   outputs['02-create.asset_page_url'] = page.url();
  155 |   outputs['02-create.url.p1'] = hardwareId;
  156 | }
  157 | 
  158 | /** Check out the asset '{{runid}} E2E Laptop' to the user 'E2E Assignee' with the note '{{runid}} checkout'. Verify the asset's page then shows it is checked out to E2E Assignee. */
  159 | async function step03Verify(page: Page, { vars, outputs }: StepContext): Promise<void> {
  160 |   const hardwareId = need(outputs, '02-create.url.p1', '03-verify');
  161 |   // s_089d13 — recorded on /hardware/<hardwareId>
  162 |   // @step 03-verify s_089d13/1
  163 |   await page.locator(`.box-header a[href$="/hardware/${hardwareId}/checkout"]`).click();
  164 |   await expect(page).toHaveURL(/\/hardware\/[^/]+\/checkout$/);
  165 |   // s_d9fe3e — recorded on /hardware/<hardwareId>/checkout
  166 |   // @step 03-verify s_d9fe3e/1
  167 |   await expect(page.locator('select[name="assigned_user"]')).toBeVisible({ timeout: 8000 });
  168 |   // @step 03-verify s_d9fe3e/2
  169 |   // @step 03-verify s_d9fe3e/3
  170 |   await pick(page, page.locator('.select2-container').nth(1), page.getByRole('option', { name: 'E2E Assignee (e2e-assignee)', exact: true }));
  171 |   // @step 03-verify s_d9fe3e/4
  172 |   await page.getByRole('textbox', { name: 'Notes', exact: true }).fill(`${vars.runid} checkout`);
  173 |   // @step 03-verify s_d9fe3e/7
  174 |   await page.getByRole('button', { name: 'Checkout', exact: true }).click();
  175 |   await expect(page).toHaveURL(/\/hardware$/);
  176 |   await expect(page.getByText('Asset checked out successfully.')).toBeVisible();
  177 |   // s_ead73d — recorded on /licenses
  178 |   // @step 03-verify s_ead73d/1
  179 |   await visit(page, `/hardware/${hardwareId}`);
  180 |   // s_51984e — recorded on /hardware/<hardwareId>
  181 |   // @step 03-verify s_51984e/1
  182 |   outputs['03-verify.asset_page_heading'] = (await page.locator('.checked-out-to, .dynamic-form-field, h1').allInnerTexts()).map((t) => t.trim()).join(' | ');
  183 |   // @step 03-verify s_51984e/2
  184 |   outputs['03-verify.checked_out_to'] = (await page.getByRole('link', { name: 'E2E Assignee', exact: true }).innerText()).trim();
  185 | }
  186 | 
  187 | /** assert: the page of the asset '{{runid}} E2E Laptop' shows it is checked out to E2E Assignee */
  188 | async function step04Assert(page: Page, { vars }: StepContext): Promise<void> {
  189 |   const failed = `assertion failed: the page of the asset '${vars.runid} E2E Laptop' shows it is checked out to E2E Assignee`;
  190 |   // s_3133ba — recorded on /hardware/:id
  191 |   // @step 04-assert s_3133ba/1
  192 |   await expect(page.getByRole('link', { name: 'E2E Assignee', exact: true }), failed).toHaveText('E2E Assignee', { useInnerText: true });
  193 |   // @step 04-assert s_3133ba/2
  194 |   await expect(page.getByRole('link', { name: 'E2E Assignee', exact: true }), failed).toBeVisible();
```