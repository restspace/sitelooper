import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import { FINGERPRINT_DIMS } from '../src/execution/fingerprint.js';
import { EXECUTION_MODULES, executionClosure, parseExecutionSource } from '../src/spec/runtime-source.js';

describe('standalone execution source', () => {
  it('strictly typechecks the emitted runtime and action adapters together', () => {
    const target = [{ kind: 'id' as const, selector: '#control' }];
    const flow: SpecFlow = {
      version: 1,
      name: 'runtime-types',
      origin: 'http://app.test',
      startUrl: 'http://app.test/',
      vars: ['name'],
      steps: [{
        id: '01-actions', instruction: 'exercise the runtime', params: { v1: '{{name}}' }, outputs: [],
        segments: [{
          id: 's_runtime', template: 'exercise the runtime for {{v1}}',
          params: { v1: { example: 'Widget A', usedIn: [2], known: true } },
          // A bound identity marker: the emitted gate reaches for the shared identityRe.
          preconditions: { urlPattern: 'http://app.test/', requireText: ['{{v1}}'] },
          derived: { d1: { step: 1, at: 'p1', example: 'recorded' } },
          steps: [
            // The derived binding reads the shared urlPart; the state-shaped hash
            // expectation is checked by the shared urlMatches over `p`.
            { tool: 'goto', args: { url: 'http://app.test/record/current' }, locators: {}, expect: { urlPattern: 'http://app.test/record/{{d1}}#action=:id&menu_id={{v1}}' } },
            // The alert gate: the shared alertVerdict over liveAlerts before and after.
            // The page-change gate: the shared expectedChangesVerdict over the lines
            // captured before and after, and a recorded dialog that may not open.
            { tool: 'click', args: { target: '@e1' }, locators: { target }, expect: { addedContains: ['- dialog "Options"', '- button "Apply"', '- combobox "Project": {{v1}}'], urlPattern: 'http://app.test/record/{{d1}}', alertContains: 'Saved {{v1}}' }, mints: { at: 'p1' } },
            // ...and the step that was going to act inside it: the shared namesDialogControl decides the skip.
            { tool: 'click', args: { target: '@e2' }, locators: { target: [{ kind: 'role' as const, role: 'button', name: 'Apply' }] } },
            { tool: 'dblclick', args: { target: '@e1' }, locators: { target } },
            // fill, type and select: the three adapters over the shared recipe ladders.
            { tool: 'fill', args: { target: '@e1', value: 'value' }, locators: { target } },
            { tool: 'type', args: { target: '@e1', text: 'typed', delay_ms: 5 }, locators: { target } },
            { tool: 'select', args: { target: '@e1', option: 'Option', optionValue: '17' }, locators: { target } },
            { tool: 'hover', args: { target: '@e1' }, locators: { target } },
            { tool: 'read', args: { target: '@e1', what: 'text' }, locators: { target }, label: 'readback' },
            { tool: 'wait_for', args: { target: '@e1', state: 'hidden' }, locators: { target } },
            { tool: 'wait_for', args: { target: '@e1', state: 'text_contains', text: 'Saved' }, locators: { target: [...target, { kind: 'role' as const, role: 'status', name: 'Status' }] } },
            { tool: 'back', args: {}, locators: {}, expect: { urlPattern: 'http://app.test/' } },
            // A folded loop: the shared loop policy, its guard resolved
            // first-match over the chain and its body run per cursor.
            {
              tool: 'loop', args: {}, locators: {}, max: 3, scope: 'drain',
              while: [{ kind: 'css' as const, selector: '.row .del' }, { kind: 'role' as const, role: 'button', name: 'Remove' }],
              body: [{ tool: 'click', args: { target: '@e1' }, locators: { target } }],
            },
            // A target inside a recorded frame, read and clicked there, on the
            // page the procedure is on, opening a popup the procedure follows
            // (the shared context module: rootFor, pageIndexVerdict, armPageEffect).
            { tool: 'read', args: { target: '@f1e1', what: 'text' }, locators: { target }, contexts: { target: { frame: [{ selectors: ['iframe[title="Payment"]'], title: 'Payment' }] } }, label: 'framed' },
            {
              tool: 'click', args: { target: '@f1e2' }, locators: { target },
              contexts: { target: { frame: [{ selectors: ['iframe[title="Payment"]', 'iframe >> nth=0'], title: 'Payment', urlPattern: 'http://app.test/pay' }] } },
              page: 0, effect: { kind: 'popup', urlPattern: 'http://app.test/popup' },
            },
            // A navigation, whose target the shared retargetNavigation resolves
            // against what this segment has watched vary (last, so the locals
            // every assertion above names keep their numbers).
            { tool: 'goto', args: { url: 'http://app.test/record/7' }, locators: {} },
          ],
        }, {
          // A second segment that does not navigate itself, with a recorded page
          // fingerprint: its url precondition measures the live page through the
          // shared fingerprint module, reading the vector back out of FLOW.
          id: 's_measured', template: 'confirm on the list',
          params: {},
          preconditions: { urlPattern: 'http://app.test/', fingerprint: Array.from({ length: FINGERPRINT_DIMS }, (_, i) => (i % 9 === 0 ? 0.333 : 0)) },
          steps: [{ tool: 'click', args: { target: '@e1' }, locators: { target } }],
        }],
      }],
    };
    const filename = path.resolve('test/.execution-source-generated.ts');
    const emitted = emitFlowFile(flow, { tier: 'plain' }).source;
    // Every shipped module must typecheck INSIDE an artifact under the
    // artifact's own compiler contract, and every one of them is named by the
    // emitter itself for this fixture — `recipes` through the `fill`/`type`/
    // `select` adapters (C7 stage B). A module the emitted file did not carry
    // would be appended with its closure below, so a new shipped module still
    // typechecks here before it has a call site; but the list must be empty
    // for what ships today, or the emitter has stopped naming a module.
    const carried = (text: string, name: string) => text.includes(`// Shared execution source: ${name}.ts.`);
    const missing = executionClosure(EXECUTION_MODULES).filter((m) => !carried(emitted, m.name));
    expect(missing.map((m) => m.name), 'every shipped module is embedded by the emitter itself').toEqual([]);
    const source = [emitted, ...missing.map((m) => m.source.join('\n')), '']
      .join('\n')
      // the appended modules need the Locator type; the fixture's own helpers may already import it
      .replace(/^import \{ expect, test, (?!type Locator, )/m, 'import { expect, test, type Locator, ');
    expect(source).toContain("import { type ElementHandle, expect, test, type Locator, type Page } from '@playwright/test';");
    expect(source).toContain('async function resolveCandidates(page: Page, cands: readonly CandidateObservation[], policy: ResolvePolicy = {}): Promise<Resolution | null> {');
    expect(source.indexOf('// Shared execution source: point.ts.')).toBeLessThan(source.indexOf('// Shared execution source: resolve.ts.'));
    // The fixture really exercises the shared text and url rules, each embedded once.
    expect(source).toContain('confirmPresence(page, [`${p.v1}`], 2, { whole: true })');
    expect(source).toContain("bindPart(p, 'd1', urlPart(page.url(), 'p1'));");
    expect(source).toContain("changedCreation(urlPart(urlBefore2, 'p1'), await urlPartWhen(page, 'p1', urlBefore2))");
    expect(source).toContain('=> urlMatches(');
    // ...and the gate verdicts with the observation they are asked over.
    expect(source).toContain("await urlEffect(page, 'http://app.test/record/{{d1}}', p, '01-actions s_runtime/2', volatile1, obs2?.link());");
    expect(source).toContain("alertGate(alertsBefore2, alertsAfter2, { where: '01-actions s_runtime/2', isRead: false, expectedContains: 'Saved {{v1}}', params: p, effectConfirmed: changes2.confirmed === true });");
    expect(source).toContain('alertsAfter2 = await settledAlerts(page);');
    // ...a navigation resolved through the shared retargetNavigation, whose
    // verdict this step's alert gate reads the cause of a dead page off.
    expect(source).toMatch(/nav\d+ = navigationTarget\('http:\/\/app\.test\/record\/7', page, volatile1, '01-actions s_runtime\/\d+'\);/);
    expect(source).toMatch(/alertGate\(alertsBefore\d+, alertsAfter\d+, \{ where: '01-actions s_runtime\/\d+', isRead: false, params: p, navigatedToStale: nav\d+\.stale \}\);/);
    expect(source).toContain("errorPageGate(page, '01-actions s_runtime/1');");
    expect(source).toContain('const verdict = alertVerdict(before, after ? after.alerts : null, ctx, after ? after.complete : true);');
    // ...the content expectation, in the same snapshot dialect on both sides.
    expect(source).toContain('linesBefore2 = await capturePageLines(page);');
    // ...with positional resolution reported by the resolution itself, not guessed at compile time.
    expect(source).toContain(
      "const changes2 = await expectChanges(page, ['- dialog \"Options\"', '- button \"Apply\"', '- combobox \"Project\": {{v1}}'], p, { tag: '01-actions s_runtime/2', tool: 'click', positionalResolution: positional2 }, linesBefore2);",
    );
    expect(source).toContain('absentDialog = changes2.absentDialog ?? null;');
    expect(source).toContain('positional2 = positional2 || hit1.structural || hit1.nth !== undefined;');
    // ...and every locator resolved through the shared policy with the daemon's policy inputs.
    // (a navigation click with a recorded destination through the shared navigation fallback)
    expect(source).toContain("], '01-actions s_runtime/2 target', { stayOnOrigin: 'http://app.test', waitMs: RESOLVE_WAIT_MS }, 'http://app.test/record/{{d1}}', p, { drift: run.drift });");
    expect(source).toContain("if (!hit1) return { status: 'skipped' };");
    expect(source).toMatch(/const hit\d+ = await pick\(page, \[/);
    // ...a text wait's held-elsewhere fallback over its hoisted observations, and the echo ledger.
    expect(source).toMatch(/await textHeldOrThrow\(err, observations\d+, 'text_contains', 'Saved', '01-actions s_runtime\/\d+', run\.drift\);/);
    expect(source).toContain('const typed1 = new Set<string>();');
    expect(source).toContain('if (!run.created.includes(minted2)) run.created.push(minted2);');
    expect(source).toContain('const hit = await resolveCandidates(page, candidates, policy);');
    expect(source).toContain('let absentDialog: { name: string; lines: string[] } | null = null;');
    expect(source).toContain("(await absentDialogSkip([page.getByRole('button', { name: roleName('Apply'), exact: true })], {\"target\":[{\"kind\":\"role\",\"name\":\"Apply\"}]}, absentDialog, p, '01-actions s_runtime/3'))");
    expect(source).toContain('last = await expectedChangesVerdict(recorded, p, ctx, {');
    // ...and the loop policy, called rather than restated.
    expect(source).toContain('await runFoldedLoop({');
    expect(source).toContain("shrinkWaitMs: LOOP_SHRINK_WAIT_MS");
    // ...and the recipe runner, embedded with its sibling ahead of it, driven
    // by the three adapters over the artifact's own compile-time snapshot.
    expect(source).toContain('async function applyRecipe(page: Page, target: Locator, intent: RecipeIntent, payload: string, book: RecipeBook): Promise<RecipeAttempt | null> {');
    expect(source).toContain('async function fillWithRecipe(page: Page, target: Locator, value: string, book: RecipeBook): Promise<RecipeAttempt | null> {');
    expect(source.indexOf('// Shared execution source: browser.ts.')).toBeLessThan(source.indexOf('// Shared execution source: recipes.ts.'));
    expect(source).toContain('const RECIPES: RecipeSnapshot = {"version":1,"recipes":[');
    expect(source).toContain('const recipeBook = snapshotBook(RECIPES);');
    expect(source.indexOf('// Shared execution source: recipes.ts.')).toBeLessThan(source.indexOf('const recipeBook = snapshotBook(RECIPES);'));
    expect(source).toContain('const attempt = await fillWithRecipe(loc.page(), loc, value, recipeBook);');
    expect(source).toMatch(/await type\(hit\d+\.locator, 'typed', \{ delay: 5 \}\)\.catch\(actionFailed\);/);
    expect(source).toContain('const attempt = await typeWithRecipe(loc.page(), loc, text, recipeBook, { timeout: TYPE_TIMEOUT_MS, delay: opts.delay ?? TYPE_DELAY_MS });');
    expect(source).toMatch(/await select\(hit\d+\.locator, 'Option', '17'\)\.catch\(actionFailed\);/);
    // ...and every state-changing action observed from just before it dispatches (the shared action module).
    expect(source).toMatch(/obs\d+ = beginAction\(page, \{ deadlineMs: ACTION_DEADLINE_MS, navigating: true, expect: effectExpectation\(page, \['- combobox "Project": \{\{v1\}\}'\], p\) \}\);/);
    expect(source).toContain('const ACTION_DEADLINE_MS = 25000;');
    expect(source).toContain('    pageTraffic(page);');
    expect(source).toContain('const { attempt } = await selectWithRecipe(loc.page(), loc, label, recipeBook, fallbackValue);');
    // ...and the fingerprinted segment's gate, measured as replay measures it.
    expect(source).toContain("await preconditionGate('http://app.test/', page.url(), p, '01-actions s_measured', cosine(recordedFingerprint('01-actions', 's_measured'), (await fingerprintPage(page)) ?? undefined));");
    expect(source).toContain('async function fingerprintPage(page: Page): Promise<number[] | null> {');
    // ...the frame and page context: a frame root ahead of the chain, the page gate, the popup armed and followed.
    expect(source).toContain(`const root2 = await frameRoot(page, [{"selectors":["iframe[title=\\"Payment\\"]","iframe >> nth=0"],"title":"Payment","urlPattern":"http://app.test/pay"}], '01-actions s_runtime/15 target');`);
    expect(source).toMatch(/\{ locator: root2\.locator\('#control'\), index: 0/);
    expect(source).toContain("pageGate(page, 0, '01-actions s_runtime/15');");
    expect(source).toContain(`landing15 = await armPageEffect(page, {"kind":"popup","urlPattern":"http://app.test/popup"}, '01-actions s_runtime/15');`);
    expect(source).toContain('if (moved15) page = run.page = moved15;');
    expect(source).toMatch(/outputs\['01-actions\.framed'\] = 'root' in framed\d+ \? await readOptional\(page, \[/);
    for (const name of ['text', 'url', 'gates', 'observe', 'browser', 'action', 'lifecycle', 'loop', 'snapshot', 'expect', 'point', 'resolve', 'recipes', 'fingerprint', 'echo', 'recover', 'context']) {
      expect(source.split(`// Shared execution source: ${name}.ts.`).length, name).toBe(2);
    }
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      strict: true, skipLibCheck: true, noEmit: true,
      // `types: []` stops TypeScript from auto-including whatever happens to
      // sit in this repo's node_modules/@types (notably @types/node). A real
      // consumer installs only @playwright/test per the handoff's contract;
      // without this the check silently passes here and fails for them.
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
      path.resolve(file) === filename
        ? ts.createSourceFile(file, source, languageVersion, true)
        : getSourceFile(file, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([filename], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => {
      const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return `${position ? `${position.line + 1}: ` : ''}${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
    });
    expect(diagnostics).toEqual([]);
  }, 30_000);

  it('loads the shipped sources without the repository source tree', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitelooper-execution-package-'));
    try {
      const scriptDir = path.join(root, 'scripts');
      const sourceDir = path.join(root, 'src/execution');
      const specDir = path.join(root, 'dist/spec');
      fs.mkdirSync(scriptDir, { recursive: true });
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(specDir, { recursive: true });
      const script = path.join(scriptDir, 'copy-execution-source.mjs');
      fs.copyFileSync(path.resolve('scripts/copy-execution-source.mjs'), script);
      for (const name of fs.readdirSync(path.resolve('src/execution')).filter((name) => name.endsWith('.ts'))) {
        fs.copyFileSync(path.resolve('src/execution', name), path.join(sourceDir, name));
      }
      const copy = spawnSync(process.execPath, [script], { encoding: 'utf8' });
      expect(copy.status, copy.stderr).toBe(0);
      const loaderSource = fs.readFileSync(path.resolve('src/spec/runtime-source.ts'), 'utf8');
      const loaderFile = path.join(specDir, 'runtime-source.mjs');
      fs.writeFileSync(loaderFile, ts.transpileModule(loaderSource, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText);
      // An installed package has dist and its copied assets, with no src tree.
      fs.rmSync(path.join(root, 'src'), { recursive: true });
      const loader = await import(pathToFileURL(loaderFile).href) as {
        EXECUTION_MODULES: readonly string[];
        executionSource(name: string): string[];
        executionClosure(names: readonly string[]): { name: string; dependencies: string[]; tokens: string[]; source: string[] }[];
      };
      expect([...loader.EXECUTION_MODULES].sort()).toEqual([...EXECUTION_MODULES].sort());
      expect(loader.EXECUTION_MODULES).toEqual(expect.arrayContaining(['browser', 'lifecycle', 'text', 'url', 'gates', 'observe']));
      expect(loader.executionSource('gates').join('\n')).toContain('function alertVerdict(');
      expect(loader.executionSource('observe').join('\n')).toContain('async function liveAlerts(page: Page, d: LineDialect = 1): Promise<string[] | null> {');
      expect(loader.executionSource('browser').join('\n')).toContain('async function robustClick(');
      expect(loader.executionSource('lifecycle').join('\n')).toContain('async function runStepLifecycle');
      expect(loader.executionSource('text').join('\n')).toContain('function identityRe(marker: string): RegExp {');
      expect(loader.executionSource('url').join('\n')).toContain('function urlMatches(pattern: string, url: string');
      expect(loader.executionSource('resolve').join('\n')).toContain('async function resolveCandidates(');
      expect(loader.executionSource('point').join('\n')).toContain('async function markPoint(');
      expect(loader.executionClosure(['resolve']).map((m) => m.name)).toEqual(['browser', 'point', 'resolve']);
      expect(loader.executionSource('recipes').join('\n')).toContain('async function fillWithRecipe(');
      expect(loader.executionSource('recipes').join('\n')).toContain('const SEED_RECIPES: SeedRecipe[] = [');
      expect(loader.executionClosure(['recipes']).map((m) => m.name)).toEqual(['browser', 'recipes']);
      expect(loader.executionSource('action').join('\n')).toContain('function beginAction(page: Page, opts: ActionOptions): ActionObservation {');
      expect(loader.executionClosure(['action']).map((m) => m.name)).toEqual(['browser', 'action']);
      expect(loader.executionSource('fingerprint').join('\n')).toContain('async function fingerprintPage(page: Page): Promise<number[] | null> {');
      expect(loader.executionClosure(['fingerprint']).map((m) => m.name)).toEqual(['fingerprint']);
      for (const name of loader.EXECUTION_MODULES) {
        expect(loader.executionSource(name).join('\n')).not.toMatch(/^(?:import|export)\s/m);
      }
      // a module that was never shipped is refused, not silently empty
      expect(() => loader.executionSource('missing')).toThrow(/not shipped/);
      expect(() => loader.executionSource('../spec/emit')).toThrow(/Not a shared execution module name/);

      // Transitive embedding through the SHIPPED loader: a synthetic module that
      // imports two siblings comes out with the imports stripped, both siblings
      // carried ahead of it, and none of them twice.
      fs.writeFileSync(path.join(root, 'dist/execution/source/gate.ts'), [
        "import type { Page } from 'playwright-core';",
        "import { identityRe, WILDCARD } from './text.js';",
        "import type { UrlSegDiff } from './url.js';",
        "import { urlMatches } from './url.js';",
        'export const GATE_WAIT_MS = 5_000;',
        'export function gate(page: Page, pattern: string, marker: string): UrlSegDiff[] | boolean {',
        '  return urlMatches(pattern, page.url()) && identityRe(marker).test(WILDCARD);',
        '}',
        '',
      ].join('\n'));
      const closure = loader.executionClosure(['gate', 'text']);
      expect(closure.map((m) => m.name)).toEqual(['text', 'url', 'gate']);
      const gate = closure[2];
      expect(gate.dependencies).toEqual(['text', 'url']);
      expect(gate.tokens).toEqual(['gate(', 'GATE_WAIT_MS']);
      expect(gate.source.join('\n')).not.toMatch(/^import\s/m);
      expect(gate.source.join('\n')).toContain('function gate(page: Page, pattern: string, marker: string)');
      expect(gate.source.join('\n')).toContain('const GATE_WAIT_MS = 5_000;');
      // and a cycle is an error, not a hang
      fs.writeFileSync(path.join(root, 'dist/execution/source/loop-a.ts'), "import { b } from './loop-b.js';\nexport const a = 1;\n");
      fs.writeFileSync(path.join(root, 'dist/execution/source/loop-b.ts'), "import { a } from './loop-a.js';\nexport const b = 2;\n");
      expect(() => loader.executionClosure(['loop-a'])).toThrow(/cycle: loop-a -> loop-b -> loop-a/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('carries every shipped module with its dependencies ahead of it', () => {
    const modules = executionClosure(EXECUTION_MODULES);
    expect(modules.map((m) => m.name).sort()).toEqual([...EXECUTION_MODULES].sort());
    for (const [i, module] of modules.entries()) {
      for (const dependency of module.dependencies) {
        expect(modules.findIndex((m) => m.name === dependency), `${module.name} needs ${dependency} first`).toBeLessThan(i);
      }
    }
    // the tokens the emitter keys on are the modules' own exports
    expect(modules.find((m) => m.name === 'text')!.tokens).toEqual(
      expect.arrayContaining(['identityRe(', 'escapeRe(', 'maskVolatile(', 'WILDCARD', 'IDENTITY_EDGE']),
    );
    expect(modules.find((m) => m.name === 'url')!.tokens).toEqual(expect.arrayContaining(['urlPart(', 'urlMatches(', 'fillParams(']));
    const gates = modules.find((m) => m.name === 'gates')!;
    expect(gates.tokens).toEqual(
      expect.arrayContaining(['errorPageVerdict(', 'urlEffectVerdict(', 'alertVerdict(', 'preconditionVerdict(', 'markersBound(', 'SOFT_MATCH_MIN_SIMILARITY']),
    );
    expect(gates.dependencies).toEqual(['text', 'url']);
    expect(modules.find((m) => m.name === 'observe')!.tokens).toEqual(expect.arrayContaining(['liveAlerts(']));
    const resolve = modules.find((m) => m.name === 'resolve')!;
    expect(resolve.tokens).toEqual(
      expect.arrayContaining(['resolveCandidates(', 'identityValues(', 'identityFields(', 'orderCandidates(', 'structuralCandidate(', 'candidateRank(', 'RESOLVE_POLL_MS', 'RESOLVE_WAIT_MS']),
    );
    expect(resolve.dependencies).toEqual(['browser', 'point']);
    expect(modules.find((m) => m.name === 'point')!.tokens).toEqual(expect.arrayContaining(['markPoint(', 'pointLocator(', 'pointToken(', 'POINT_MARK']));
    const recipes = modules.find((m) => m.name === 'recipes')!;
    expect(recipes.tokens).toEqual(
      expect.arrayContaining([
        'recognizeComponent(', 'executeRecipe(', 'verifyRecipe(', 'readComponentValue(', 'squashText(', 'applyRecipe(', 'describeRecipeAttempt(',
        'snapshotBook(', 'fillWithRecipe(', 'typeWithRecipe(', 'selectWithRecipe(', 'editorSetValueSteps(', 'recipeFamilyOf(',
        'RECIPE_FAMILIES', 'SEED_RECIPES', 'RECIPE_RECOGNIZE_MS', 'RECIPE_STEP_TIMEOUT_MS',
      ]),
    );
    expect(recipes.dependencies).toEqual(['browser']);
    const fingerprint = modules.find((m) => m.name === 'fingerprint')!;
    expect(fingerprint.tokens).toEqual(expect.arrayContaining(['fingerprintPage(', 'cosine(', 'normaliseFingerprint(', 'fingerprintPathsInPage(', 'FINGERPRINT_DIMS']));
    expect(fingerprint.dependencies).toEqual([]);
    const context = modules.find((m) => m.name === 'context')!;
    expect(context.tokens).toEqual(
      expect.arrayContaining(['rootFor(', 'armPageEffect(', 'pageIndexVerdict(', 'stepEffect(', 'describeFramePath(', 'framesEqual(', 'contextsEqual(', 'POPUP_WAIT_MS', 'FRAME_POLL_MS']),
    );
    // The frame lookup and the popup follow need only the url rules.
    expect(context.dependencies).toEqual(['url']);
    const action = modules.find((m) => m.name === 'action')!;
    expect(action.tokens).toEqual(
      expect.arrayContaining(['beginAction(', 'pageTraffic(', 'classifyLongLived(', 'inFlightRequests(', 'DEFAULT_TRAFFIC_POLICY', 'ACTION_START_GRACE_MS', 'ACTION_NETWORK_CAP_MS', 'ACTION_EFFECT_WAIT_MS']),
    );
    // The observation waits with the shared DOM settle and url wait, and reads the outcome of an error there.
    expect(action.dependencies).toEqual(['browser']);
    expect(modules.find((m) => m.name === 'browser')!.tokens).toEqual(expect.arrayContaining(['robustClick(', 'actionFailure(', 'outcomeOfError(', 'outcomeLabel(', 'domQuiet(', 'settleDom(']));
  });

  it('strips a sibling import and rejects any other', () => {
    const parsed = parseExecutionSource('gate', [
      "import type { Locator } from 'playwright-core';",
      "import { a } from './text.js';",
      "import type { UrlShape } from './url.js';",
      "import { b } from './text.js';",
      'export function gate(): void {}',
      '',
    ].join('\n'));
    expect(parsed.dependencies).toEqual(['text', 'url']);
    expect(parsed.source).toEqual(['// Shared execution source: gate.ts. Regenerate to update.', 'function gate(): void {}']);
    // anything outside the shared family is a dependency the artifact cannot carry
    for (const line of [
      "import { fillParams } from '../skills/compile.js';",
      "import fs from 'node:fs';",
      "import { WILDCARD } from '../shared/text.js';",
      "import { chromium } from 'playwright-core';",
      "export { a } from './text.js';",
    ]) {
      expect(() => parseExecutionSource('gate', `${line}\nexport function gate(): void {}\n`), line).toThrow(/cannot embed/);
    }
    expect(() => parseExecutionSource('gate', "import { x } from './gate.js';\n")).toThrow(/imports itself/);
  });
});
