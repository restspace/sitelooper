/**
 * Round 85: the two gaps the third ERPNext sweep (fwen3-luna) left, each
 * judged on slices of the published n1 recording (test/fixture/fwen3-luna-n1-*)
 * and on what the replays' own browsers showed (fwen3-luna-n2/-n3-flowrun.json).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills, recordedLanding, substituteEscapedUrl } from '../src/skills/compile.js';
import { pastDetours } from '../src/skills/replay.js';
import { detourGiven, gotoLandingVerdict, preconditionVerdict } from '../src/execution/gates.js';
import { landingVerdictWithFacts } from '../src/execution/facts-route.js';
import { emptyFacts } from '../src/execution/facts.js';
import { fillParams, fillParamsDeep, urlMatches } from '../src/execution/url.js';
import { SkillStore, type Skill } from '../src/skills/store.js';
import type { Flow } from '../src/skills/flow.js';
import { flowToSpec } from '../src/spec/ir.js';
import { emitFlowFile } from '../src/spec/emit.js';
import { liftFlowFile } from '../src/spec/lift.js';
import { specToFlow } from '../src/spec/lower.js';

const EN = 'http://127.0.0.1:8100';

let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-r85-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const fixture = (name: string): RecordedEntry[] => parseScript(fs.readFileSync(path.join(__dirname, 'fixture', name), 'utf8')).entries;

/** One recorded instruction of fwen3-luna-n1, compiled as the daemon compiled it. */
function compile(name: string, knownValues: Record<string, string> = { 'var:runid': 'fwen3-luna-n1' }): Skill[] {
  const entries = fixture(name);
  const report = entries.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report')!;
  const instruction = (entries[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
  return compileSkills({
    entries: entries.filter((e) => e.k !== 'report'),
    instruction,
    report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
    session: 'fwen3-luna-n1',
    knownValues,
  });
}

/** The emitted artifact for one flow step pinned to `skills`' chain head. */
function emitStep(skills: Skill[], id: string, params: Record<string, string>, vars: string[] = []): string {
  const dir = fs.mkdtempSync(path.join(tmp, 'store-'));
  const store = new SkillStore(dir);
  for (const s of skills) store.put(s);
  const flow = {
    name: 'fwen3-luna',
    origin: EN,
    startUrl: `${EN}/`,
    vars,
    steps: [{ id, instruction: skills[0].provenance.instruction, skill: skills[0].id, params, outputs: [] }],
  } as unknown as Flow;
  return emitFlowFile(flowToSpec(flow, store).spec, { tier: 'plain' }).source;
}

const stepBodies = (source: string): string => source.slice(source.indexOf('export const steps = {'));

function syntaxErrors(source: string): string[] {
  const out = ts.transpileModule(source, { fileName: 'flow.ts', reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

/**
 * GAP A. n1 was recorded twice under one runid: the first attempt (20:46–21:16Z)
 * was cut off, and the second began in the browser profile the first had left
 * signed in. Its sign-in is `goto /login` (redirected to /app/home), a log-out,
 * the login form, a read. n2, n3 and the compiled spec, in clean browsers:
 * "s_c137ad stopped at step ? — not on the page this procedure starts from
 * (expects http://127.0.0.1:8100/app/home, browser is at
 * http://127.0.0.1:8100/login) — nothing was run".
 */
describe('fwen3-luna 01-signin: a detour the recording took after a redirected goto is passed over when the goto is given its page', () => {
  const skills = compile('fwen3-luna-n1-01-signin.jsonl');
  const params = { v1: `${EN}/`, v2: 'Administrator', v3: '{{env:APP_PASSWORD}}' };
  const segmentAt = (index: number) => skills.find((s) => s.seq?.index === index);

  it('compiles the chain the sweep stored: goto, log-out, login form, read', () => {
    expect(skills.map((s) => s.steps.map((st) => st.tool))).toEqual([['goto'], ['click', 'click', 'click'], ['fill', 'fill', 'click'], ['read']]);
    expect(skills[0].steps[0].args.url).toBe(`${EN}/login`);
    expect(skills[1].preconditions.urlPattern).toBe(`${EN}/app/home`);
  });

  it('marks the log-out segment — and only it — as the detour of the redirected goto', () => {
    expect(skills.map((s) => s.detour)).toEqual([undefined, { asked: `${EN}/login` }, undefined, undefined]);
  });

  it("n2/n3's browser, given /login, passes over the log-out and runs the login form next", () => {
    for (const url of [`${EN}/login`, `${EN}/login#login`]) {
      expect(detourGiven(skills[1].detour!.asked, skills[1].preconditions.urlPattern, url, params)).toBe(true);
      const { next, skipped } = pastDetours(segmentAt, 1, url, params);
      expect(skipped.map((s) => s.id)).toEqual([skills[1].id]);
      expect(next?.id).toBe(skills[2].id);
      // …and the segment it goes on to starts there by its own gate: s_e21a21's,
      // as the published store holds it (its `#login` anchor already dropped by
      // the route.fragment fact n1 banked).
      expect(preconditionVerdict(`${EN}/login?redirect-to=/app/home`, url, params, null).refuse).toBeUndefined();
    }
    expect(skills[2].preconditions.urlPattern).toBe(`${EN}/login?redirect-to=/app/home#login`);
    expect(preconditionVerdict(skills[2].preconditions.urlPattern, `${EN}/login#login`, params, null).refuse).toBeUndefined();
  });

  it('a browser the app redirects as it did at record time (signed in) runs the log-out as recorded', () => {
    const url = `${EN}/app/home`;
    expect(detourGiven(skills[1].detour!.asked, skills[1].preconditions.urlPattern, url, params)).toBe(false);
    const { next, skipped } = pastDetours(segmentAt, 1, url, params);
    expect(skipped).toEqual([]);
    expect(next?.id).toBe(skills[1].id);
  });

  it('any third page is left to the detour segment\'s own gate to refuse', () => {
    for (const url of [`${EN}/app/selling`, `${EN}/`, `${EN}/login/reset`, 'http://other.test/login']) {
      expect(pastDetours(segmentAt, 1, url, params).next?.id).toBe(skills[1].id);
    }
    expect(preconditionVerdict(skills[1].preconditions.urlPattern, `${EN}/app/selling`, params, null).refuse).toMatch(/not on the page this procedure starts from/);
  });

  it('never passes over the last segment, nor a segment that is no detour', () => {
    const last = { ...skills[3], detour: { asked: `${EN}/login` } };
    const chain = [skills[0], skills[1], skills[2], last];
    expect(pastDetours((i) => chain[i], 3, `${EN}/login`, params)).toEqual({ next: last, skipped: [] });
    expect(pastDetours(segmentAt, 2, `${EN}/app/selling`, params)).toEqual({ next: skills[2], skipped: [] });
  });

  it('the artifact guards the same segment with the same verdict, and still parses', () => {
    const source = emitStep(skills, '01-signin', params);
    const body = stepBodies(source);
    expect(body).toContain(`if (detourGiven('${EN}/login', '${EN}/app/home', page.url(), p)) {`);
    expect(body).toContain(`logWarning('01-signin ' + detourSkippedNote('${skills[1].id}', '${EN}/login', page.url()));`);
    // exactly one segment is guarded, and its own gate is inside the guard
    expect(body.match(/if \(detourGiven\(/g)).toHaveLength(1);
    const guard = body.indexOf('if (detourGiven(');
    const gate = body.indexOf(`await preconditionGate('${EN}/app/home'`);
    const nextGate = body.indexOf(`await preconditionGate('${skills[2].preconditions.urlPattern}'`);
    expect(guard).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(guard);
    expect(nextGate).toBeGreaterThan(gate);
    // the guarded segment's body closes before the next segment begins
    expect(body.slice(guard, gate)).toContain('} else {');
    expect(body.slice(gate, nextGate).split('\n')).toContain('    }');
    expect(source).toContain('function detourGiven(');
    expect(source).toContain('function detourSkippedNote(');
    expect(syntaxErrors(source)).toEqual([]);
  });

  it('the detour survives the artifact round trip (lift, lower)', () => {
    const source = emitStep(skills, '01-signin', params);
    const lifted = liftFlowFile(source).spec;
    expect(lifted.steps[0].segments.map((g) => g.detour)).toEqual([undefined, { asked: `${EN}/login` }, undefined, undefined]);
    const lowered = specToFlow(lifted).skills;
    expect(lowered.map((s) => s.detour)).toEqual([undefined, { asked: `${EN}/login` }, undefined, undefined]);
  });
});

describe('a segment is a detour only on the recording\'s own redirect-and-return', () => {
  it('fwen3-luna 03-create: gotos the app answered on their own template mark nothing', () => {
    expect(compile('fwen3-luna-n1-03-create.jsonl').every((s) => s.detour === undefined)).toBe(true);
  });

  it('no other recorded sign-in or create in the fixtures gains one', () => {
    // Four of these sign in as `goto /` → sent to /login → credentials → back on
    // `/`: a redirect and a return, but the way back IS the instruction's work.
    const others: [string, Record<string, string>][] = [
      ['fwop13-n1-01-signin.jsonl', {}],
      ['fwsi14-n1-script.jsonl', {}],
      ['fwvk13-n1-script.jsonl', {}],
      ['fwgr74-n1-01-07.jsonl', {}],
      ['fwen1-luna-n1-03-04-create.jsonl', { 'var:runid': 'fwen1-luna-n1' }],
      ['fwgt10-n1-01-open.jsonl', {}],
    ];
    let signIns = 0;
    for (const [name, known] of others) {
      const entries = fixture(name);
      // these slices hold one or more instructions; compile each
      const starts = entries.map((e, i) => (e.k === 'instruction' ? i : -1)).filter((i) => i >= 0);
      for (const [n, at] of starts.entries()) {
        const group = entries.slice(at, starts[n + 1] ?? entries.length);
        const report = group.find((e): e is Extract<RecordedEntry, { k: 'report' }> => e.k === 'report');
        if (!report || report.status !== 'success') continue;
        const skills = compileSkills({
          entries: group.filter((e) => e.k !== 'report'),
          instruction: (group[0] as Extract<RecordedEntry, { k: 'instruction' }>).text,
          report: { status: 'success', summary: report.summary ?? '', evidence: { values: report.values ?? {} } },
          session: name,
          knownValues: known,
        });
        expect(skills.filter((s) => s.detour).map((s) => `${name}: ${s.id}`)).toEqual([]);
        // the shape this rule must not take: a goto sent to /login, a segment that fills there
        const head = skills[0]?.steps[skills[0].steps.length - 1];
        if (head?.tool === 'goto' && skills[1]?.preconditions.urlPattern.endsWith('/login') && skills[1].steps.some((s) => s.tool === 'fill')) signIns++;
      }
    }
    expect(signIns).toBe(4);
  });
});

/**
 * GAP B. 03-create's recording checked the customer list after saving:
 * `goto /app/customer?customer_name=%3Dfwen3-luna-n1%20Bench%20Customer`, which
 * ERPNext answered with `?customer_name=["like","%=fwen3-luna-n1 Bench Customer%"]`.
 * n2: "s_d77b76 stopped at step 2 — step 2 navigated but landed on another
 * view: customer_name=["like","%=fwen3-luna-n1 Bench Customer%… where it was
 * sent to customer_name==fwen3-luna-n1 Bench Customer". n3: "s_38f404 … expects
 * …?customer_name=["like","%=fwen3-luna-n3 Bench Customer%"], browser is at
 * …?customer_name=["like","%=fwen3-luna-n1 Bench Customer%"]".
 */
describe('fwen3-luna 03-create: a run value a goto spells percent-encoded is slotted', () => {
  const skills = compile('fwen3-luna-n1-03-create.jsonl');
  const check = skills[2];
  const goto = check.steps.find((s) => s.tool === 'goto')!;

  it('the customer filter goto carries the slot, not the recording run\'s name', () => {
    expect(goto.args.url).toBe(`${EN}/app/customer?customer_name=%3D{{v2}}`);
    expect(JSON.stringify(skills)).not.toContain('fwen3-luna-n1%20Bench');
    expect(check.params.v2).toMatchObject({ example: 'fwen3-luna-n1 Bench Customer', known: true });
    expect(check.params.v2.usedIn).toContain(check.steps.indexOf(goto) + 1);
  });

  it('n2 and n3 navigate to their own customer', () => {
    for (const run of ['fwen3-luna-n2', 'fwen3-luna-n3']) {
      const sent = fillParams(String(goto.args.url), { v1: run, v2: `${run} Bench Customer` });
      expect(new URL(sent).searchParams.get('customer_name')).toBe(`=${run} Bench Customer`);
    }
  });

  it('reads the decoded piece only where an escape hid a value, and writes the rest back encoded', () => {
    const slots = new Map([
      ['v1', 'fwen3-luna-n1'],
      ['v2', 'fwen3-luna-n1 Bench Customer'],
    ]);
    // the fixture's goto, and the same value as a path segment
    expect(substituteEscapedUrl(`${EN}/app/customer?customer_name=%3Dfwen3-luna-n1%20Bench%20Customer`, slots)).toBe(`${EN}/app/customer?customer_name=%3D{{v2}}`);
    expect(substituteEscapedUrl(`${EN}/app/customer/fwen3-luna-n1%20Bench%20Customer#details`, slots)).toBe(`${EN}/app/customer/{{v2}}#details`);
    // a '+' is a space in a query, and the text around the marker stays one query value
    expect(substituteEscapedUrl(`${EN}/app/customer?q=a%26b+fwen3-luna-n1+Bench+Customer%23x&page=2`, slots)).toBe(`${EN}/app/customer?q=a%26b%20{{v2}}%23x&page=2`);
    // what the textual pass already wrote is kept as it wrote it (fwen3-luna 04-create's goto)
    const textual = `${EN}/app/sales-order/new?customer={{v1}}%20Bench%20Customer`;
    expect(substituteEscapedUrl(textual, slots)).toBe(textual);
    // no escape, no slot value, another run's value: untouched
    for (const url of [`${EN}/app/customer?customer_name=fwen3`, `${EN}/app/customer?customer_name=%3DSeed%3A%20Alpha`, `${EN}/app/sales-order?company=%5B%22like%22%2C%22%25Bench+Company%25%22%5D`]) {
      expect(substituteEscapedUrl(url, slots)).toBe(url);
    }
  });
});

describe('fwen3-luna 03-create: a goto landing the recording itself was given is the page it asked for', () => {
  const skills = compile('fwen3-luna-n1-03-create.jsonl');
  const check = skills[2];
  const goto = check.steps.find((s) => s.tool === 'goto')!;
  const run = (id: string) => ({ v1: id, v2: `${id} Bench Customer` });
  const landedFor = (id: string) => `${EN}/app/customer?customer_name=%5B%22like%22%2C%22%25%3D${id}+Bench+Customer%25%22%5D`;

  it('keeps what ERPNext answered the recorded goto with, slotted', () => {
    expect(goto.landedAs).toEqual({ customer_name: '["like","%={{v2}}%"]' });
    // the head's goto was answered on a path position, not at a key it asked for
    expect(skills[0].steps[0].landedAs).toBeUndefined();
  });

  it('reads it off the recorded step alone: the address it sent and the url it landed on', () => {
    const recorded = fixture('fwen3-luna-n1-03-create.jsonl').find((e) => e.k === 'step' && e.tool === 'goto' && String(e.args.url).includes('customer_name'))!;
    expect(recorded.k === 'step' && recorded.diff?.url).toBe(landedFor('fwen3-luna-n1'));
    expect(recordedLanding(recorded as Extract<RecordedEntry, { k: 'step' }>, new Map())).toEqual({ customer_name: '["like","%=fwen3-luna-n1 Bench Customer%"]' });
  });

  it("n2's landing — the same rewrite, of n2's own customer — is not another view", () => {
    const params = run('fwen3-luna-n2');
    const sent = fillParams(String(goto.args.url), params);
    const landed = landedFor('fwen3-luna-n2');
    // what main said, of the recording's value: the published stop
    expect(gotoLandingVerdict(`${EN}/app/customer?customer_name=%3Dfwen3-luna-n1%20Bench%20Customer`, landedFor('fwen3-luna-n1'), 'step 2')).toBe(
      'step 2 navigated but landed on another view: customer_name=["like","%=fwen3-luna-n1 Bench Customer%… where it was sent to customer_name==fwen3-luna-n1 Bench Customer — the page it asked for was not given',
    );
    const recorded = fillParamsDeep(goto.landedAs, params) as Record<string, string>;
    expect(gotoLandingVerdict(sent, landed, 'step 2', recorded)).toBeNull();
    expect(landingVerdictWithFacts(emptyFacts(EN), sent, landed, 'step 2', recorded)).toBeNull();
    // …and the segment after it starts on that landing
    expect(urlMatches(skills[3].preconditions.urlPattern, landed, params)).toBe(true);
  });

  it('a landing that is not the recorded rewrite of this run\'s value still stops', () => {
    const params = run('fwen3-luna-n2');
    const sent = fillParams(String(goto.args.url), params);
    const recorded = fillParamsDeep(goto.landedAs, params) as Record<string, string>;
    // the recording run's customer, another filter operator, another filter altogether
    for (const landed of [landedFor('fwen3-luna-n1'), `${EN}/app/customer?customer_name=%5B%22like%22%2C%22%25fwen3%25%22%5D`, `${EN}/app/customer?customer_name=Seed`]) {
      expect(gotoLandingVerdict(sent, landed, 'step 2', recorded)).toMatch(/landed on another view: customer_name=/);
      expect(landingVerdictWithFacts(emptyFacts(EN), sent, landed, 'step 2', recorded)).toMatch(/landed on another view/);
    }
    // a key the recording saw no rewrite of is judged exactly as before (fwod45)
    const odoo = ['http://odoo/web#cids=1&action=316&model=sale.order&view_type=form&id=22', 'http://odoo/web#action=316&model=sale.order&view_type=list&cids=1'] as const;
    expect(gotoLandingVerdict(odoo[0], odoo[1], 'step 11', recorded)).toBe(gotoLandingVerdict(odoo[0], odoo[1], 'step 11'));
    expect(gotoLandingVerdict(odoo[0], odoo[1], 'step 11')).toMatch(/view_type=list where it was sent to view_type=form/);
  });

  it('the artifact hands the same recorded landing to the same verdict', () => {
    const source = emitStep(skills, '03-create', { v1: '{{runid}}', v2: '{{runid}} Bench Customer' }, ['runid']);
    const body = stepBodies(source);
    expect(body).toContain(", { 'customer_name': `[\"like\",\"%=${p.v2}%\"]` }); if (landing) throw new Error(landing); }");
    expect(body).toContain('navigationTarget(`http://127.0.0.1:8100/app/customer?customer_name=%3D${p.v2}`');
    // a goto the recording saw answered as sent carries nothing
    expect(body).toMatch(/landingVerdictWithFacts\(siteFactsAt\(landed\), nav\d+\.url, landed, '03-create s_\w+\/1'\); if/);
    expect(syntaxErrors(source)).toEqual([]);
  });
});

/**
 * Both additions change the artifact's TEXT — a guard around a whole segment,
 * an extra argument on a shared verdict — so the files are type-checked, not
 * only parsed: a segment body moved into a block must not strand a name a
 * later segment or the report uses.
 */
describe('the artifacts of both fwen3-luna steps typecheck', () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.resolve('test/.r85-emit-'));
  });
  afterAll(() => {
    expect(path.basename(dir)).toMatch(/^\.r85-emit-/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('01-signin (guarded detour) and 03-create (recorded landing)', () => {
    const files: string[] = [];
    const signin = emitStep(compile('fwen3-luna-n1-01-signin.jsonl'), '01-signin', { v1: `${EN}/`, v2: 'Administrator', v3: '{{env:APP_PASSWORD}}' });
    const create = emitStep(compile('fwen3-luna-n1-03-create.jsonl'), '03-create', { v1: '{{runid}}', v2: '{{runid}} Bench Customer' }, ['runid']);
    for (const [name, source] of [['signin.flow.ts', signin], ['create.flow.ts', create]] as const) {
      files.push(path.join(dir, name));
      fs.writeFileSync(files[files.length - 1], source);
    }
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    });
    expect(ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))).toEqual([]);
  }, 120_000);
});
