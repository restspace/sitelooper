#!/usr/bin/env node
/**
 * Rebuild a flow from a RECORDED session, offline, and fingerprint the result.
 *
 *   node bench/rebuild-flow.mjs --tag fwod25 --dir bench/results-published
 *   node bench/rebuild-flow.mjs --tag fwod25 --baseline bench/fixtures/fwod25.json
 *
 * WHY THIS EXISTS
 *
 * `bench/sweep.mjs --from` already A/Bs a REPLAY-path change: it reuses an
 * earlier sweep's recording, so two runs differ only in code. Its own comment
 * states the precondition it cannot meet —
 *
 *   "A fix in the recorder, in compile, or in buildFlow changes what run 1
 *    PRODUCES and must be measured with a fresh recording."
 *
 * — and a fresh recording is model-driven, so every sweep compiles a DIFFERENT
 * procedure. That is not a control. fwod25 is what it costs: 50 minutes and
 * three runs to test one recording-path change, and the answer was unreadable,
 * because the recording bore no resemblance to fwod24's. Its flow came out with
 * zero outputs, zero cross-step references and seven literal `S00021`, and
 * nothing in it could be attributed to the change under test.
 *
 * So hold the recording constant instead of the code. A published `script.jsonl`
 * is a complete, deterministic record of one run: every instruction, every step
 * with its target and result, every report. Everything that happens AFTER the
 * model speaks — flattenComposedValues, backfillReadValues, slug, cites,
 * compile, buildFlow, lintFlowRefs — is a pure function of it. Replay that half
 * offline, in seconds, for free, against as many past recordings as we have.
 *
 * WHAT IT CANNOT TELL YOU
 *
 * The naming ask is a live exchange: this reports which values it WOULD hold a
 * report for (`unnamedReadValues`, the real predicate), but not what a model
 * would answer. That part needs a model — one instruction of one, not a sweep.
 * Everything downstream of the answer is covered here.
 *
 * The fingerprint is deliberately the things that have actually gone wrong:
 * how many cross-step references a flow carries, what each step publishes,
 * and how many record identities are still frozen in as literals.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/** dist/ is imported by URL: a bare Windows path is not a legal ESM specifier. */
const dist = (rel) => pathToFileURL(path.join(root, 'dist', rel)).href;
const { buildFlow, commentaryReport, lintFlowRefs, staleInstructionIds, taskConstants } = await import(dist('skills/flow.js'));
const { SkillStore } = await import(dist('skills/store.js'));
const { bindSkill, publishedOutputs } = await import(dist('skills/learn.js'));
const { carryOpener, compileSkills } = await import(dist('skills/compile.js'));
const { RunLedger } = await import(dist('skills/ledger.js'));
const { urlParts } = await import(dist('execution/url.js'));
const { backfillReadValues, flattenComposedValues, promoteLabelledReads, unnamedReadValues } = await import(dist('agent/report.js'));
const { parseScript, selectionReadBack } = await import(dist('daemon/recorder.js'));

const argv = process.argv.slice(2);
const arg = (name, dflt) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);
const tag = arg('--tag');
const dir = path.resolve(arg('--dir', 'bench/results-published'));
const baselineFile = arg('--baseline');
const writeBaseline = argv.includes('--write-baseline');
// Deterministic labelling arm: backfill EVERY unnamed singular read under a
// selector-derived name, not only the ones the prose cites. The A/B this flag
// exists for: same recordings, same code, citation gate on vs off.
const labelAll = argv.includes('--label-all');
// Post-session relabel arm: run the one smart-model rename pass over each
// recording's value names before anything else sees the entries — the same
// call the daemon now makes at export, priced and inspected offline.
const relabelModel = arg('--relabel-model');
const relabelProvider = arg('--provider', 'openrouter');

if (!tag) {
  console.error('usage: rebuild-flow.mjs --tag <sweepTag> [--dir <published>] [--baseline <file>] [--write-baseline]');
  process.exit(2);
}

/** Every recorded session for the tag, newest run last: fwod25-n1, fwod25-n2, … */
function sessions() {
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${tag}-n`) && f.endsWith('-script.jsonl'))
    .sort()
    .map((f) => ({ runid: f.slice(0, -'-script.jsonl'.length), file: path.join(dir, f) }));
}

/**
 * The recording as the daemon reads it (recorder.ts parseScript): a step
 * recorded for a FAILED action is evidence only, never a gesture, so it is left
 * out here exactly as ScriptRecorder leaves it out of every read of a take.
 */
function readEntries(file) {
  return parseScript(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).entries;
}

/**
 * The reads one instruction made, in the shape the loop passes to the report
 * helpers. Mirrors ScriptRecorder.readsThisInstruction — same filters, so what
 * this reports is what the live path would have seen.
 */
function readsOf(steps) {
  const out = [];
  for (const e of steps) {
    if (e.k !== 'step' || (e.tool !== 'read' && e.tool !== 'read_all') || typeof e.result !== 'string') continue;
    if (e.args?.target === '(read-back)') continue;
    let parsed;
    try {
      parsed = JSON.parse(e.result);
    } catch {
      parsed = e.result;
    }
    const values = (Array.isArray(parsed) ? parsed : [parsed]).filter((v) => typeof v === 'string');
    const label = typeof e.args?.label === 'string' && e.args.label.trim() ? e.args.label.trim() : undefined;
    if (values.length) out.push({ target: String(e.args?.target ?? ''), values, ...(label ? { label } : {}) });
  }
  return out;
}

/** Split a session into its instructions, each with the steps and report that followed. */
function groups(entries) {
  const out = [];
  let cur = null;
  for (const e of entries) {
    if (e.k === 'instruction') {
      cur = { instruction: e.text ?? '', steps: [], report: null };
      out.push(cur);
    } else if (!cur) continue;
    else if (e.k === 'report') cur.report = e;
    else cur.steps.push(e);
  }
  return out;
}

/** Insert selectionReadBack's reads into each successful instruction of `entries`, in place. */
function withSelectionReads(entries) {
  let start = -1;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.k === 'instruction') start = i;
    if (e.k !== 'report' || start < 0) continue;
    if (e.status === 'success') {
      const steps = entries.slice(start + 1, i).filter((x) => x.k === 'step');
      const seen = new Set();
      for (const st of steps) {
        if ((st.tool !== 'read' && st.tool !== 'read_all') || typeof st.result !== 'string') continue;
        try {
          const v = JSON.parse(st.result);
          for (const x of Array.isArray(v) ? v : [v]) if (typeof x === 'string') seen.add(x.trim());
        } catch {
          seen.add(st.result.trim());
        }
      }
      for (const [k, raw] of Object.entries(e.values ?? {})) {
        const v = String(raw ?? '').trim();
        if (!v || seen.has(v)) continue;
        const got = selectionReadBack(steps, v, k);
        if (!got) continue;
        entries.splice(entries.indexOf(got.after) + 1, 0, got.read);
        seen.add(v);
        i += 1; // the report moved one place on
      }
    }
    start = -1;
  }
}

function startUrlOf(entries) {
  for (const e of entries) {
    if (e.k === 'instruction' && e.url) return e.url;
    if (e.k === 'step' && e.tool === 'goto' && typeof e.args?.url === 'string') return e.args.url;
  }
  return null;
}

const recompile = !argv.includes('--published-skills');

/**
 * Skills COMPILED FROM THE RECORDING, not read off the published store.
 *
 * The published store was built by whatever code ran that sweep, so reading it
 * makes every compile.ts change invisible here — the first cut of this file did
 * exactly that and reported "no diff" for a change that rewrote which reads
 * survive compilation. Recompiling closes that: compile.ts, and everything it
 * decides about labels and published outputs, is now under the gate.
 *
 * Each instruction's skill is registered under the id the RECORDING pinned, so
 * `step.skill` on the flow still resolves. Segmented compiles keep their own
 * ids for the tail; only the head takes the pinned one.
 */
/**
 * Re-run the post-report pipeline for one instruction, from the report AS THE
 * MODEL RETURNED IT. The recorded `values` are already post-backfill, so
 * re-deriving from them would score the old code's output: strip every name
 * that is a slug of a read target (backfill's signature) and re-decide.
 */
function rebuildReport(g, reads) {
  const modelValues = {};
  for (const [k, v] of Object.entries(g.report.values ?? {})) {
    if (!reads.some((r) => slugLike(r.target) === k.replace(/_\d+$/, ''))) modelValues[k] = v;
  }
  const rebuilt = {
    status: g.report.status,
    summary: g.report.summary ?? '',
    ...(Object.keys(modelValues).length ? { evidence: { values: modelValues } } : {}),
  };
  const wouldAsk = unnamedReadValues(rebuilt, reads);
  flattenComposedValues(rebuilt);
  promoteLabelledReads(rebuilt, reads);
  const promoted = backfillReadValues(rebuilt, reads, { requireCitation: !labelAll });
  return { rebuilt, modelValues, wouldAsk, promoted };
}

function storeFrom(entries, known, valuesByInstruction) {
  const skills = [];
  // Known values come from a RunLedger fed exactly as the daemon feeds its
  // own (server.ts seedLedger, noteMintedIds, knownValues), so every key
  // carries its ORIGIN: `var:runid`, `output:i3:asset_tag`, and — what the
  // earlier hand-rolled map never banked — `url:i3:p1`, the url position a
  // later navigation's record id is slotted by. Without those, compile made no
  // url-origin slot, buildFlow had no origin to thread, and an offline rebuild
  // under-reported url references (snipeit fwsi4 04-set's
  // {{03-create.url.p1}}, which the live flow carried).
  const ledger = new RunLedger();
  const seed = () => {
    for (const [name, value] of Object.entries(known)) ledger.add(value, { from: 'var', name }, { vouched: true });
  };
  const knownValues = () => ledger.byOrigin();
  /** server.ts noteMintedIds: url ids first, then reported values (`values` overrides a report's own, see below). */
  const bank = (group, stepId, values) => {
    for (const e of group) {
      const url = e.k === 'step' ? e.diff?.url : e.k === 'instruction' ? e.url : undefined;
      if (url) ledger.addUrlIds(url, stepId, urlParts(url), { landed: e.k === 'step' && e.tool !== 'goto' && e.tool !== 'back' });
      if (e.k === 'report') {
        const vals = e.status === 'success' && values ? values : (e.values ?? {});
        for (const [name, value] of Object.entries(vals)) {
          // The daemon skips the model's commentary about the page (flow.ts commentaryReport).
          if (commentaryReport(group, name, String(value))) continue;
          ledger.add(String(value), { from: 'output', step: stepId, name });
        }
      }
    }
  };
  /** What was known BEFORE each instruction (by its text). */
  const knownBefore = new Map();
  let cur = null;
  // A group a non-success report closed: a `resume: true` instruction that
  // follows continues it, the way the daemon compiles from the ORIGINAL
  // attempt's mark. Compiling the retry alone made the segment start on the
  // page the retry began from (fwgr25's /dashboard/new), so every replay of
  // 02-create refused it as "not on the page this procedure starts from".
  let pending = null;
  let idx = -1;
  // The daemon's instruction counter: one per `do`, which a resume continues.
  let ledgerIndex = 0;
  /** Where the current `do` began in `entries`, for carryOpener. */
  let mark = 0;
  const flushPending = () => {
    if (pending) bank([...pending.entries, ...(pending.reports ?? [])], `i${pending.ledgerIndex}`, null);
    pending = null;
  };
  for (const [at, e] of entries.entries()) {
    if (e.k === 'instruction') {
      if (e.resume && pending) {
        cur = pending;
        pending = null;
        cur.entries.push(e);
        // The daemon compiles the merged attempts under the RETRY's wording —
        // that is the instruction the flow step carries and binds against.
        cur.instruction = e.text ?? cur.instruction;
        knownBefore.set(cur.instruction, knownValues());
        idx++; // valuesByInstruction is indexed per instruction ENTRY, resumed ones included
        continue;
      }
      flushPending();
      ledgerIndex++;
      ledger.beginInstruction(ledgerIndex);
      seed();
      mark = at;
      cur = { instruction: e.text ?? '', entries: [e], ledgerIndex, mark };
      knownBefore.set(cur.instruction, knownValues());
      idx++;
    } else if (!cur) continue;
    else if (e.k === 'report') {
      cur.reports = [...(cur.reports ?? []), e];
      // Compile from the RE-DECIDED pipeline output, not the recorded
      // `e.values` — those were produced by whatever report.ts ran that
      // sweep, so using them makes a backfill/flatten change invisible to
      // every flow metric below. Same blind spot as reading the published
      // skill store, one layer up.
      const values = valuesByInstruction[idx] ?? e.values ?? {};
      if (e.status === 'success') {
        try {
          const compiled = compileSkills({
            entries: carryOpener(entries.slice(0, cur.mark), cur.entries),
            instruction: cur.instruction,
            report: { status: e.status, summary: e.summary ?? '', evidence: { values } },
            session: 'rebuild',
            // The daemon's learn call: the ledger so far, and the task's
            // constants judged over the whole script so far (server.ts
            // taskConstants).
            knownValues: knownValues(),
            taskConstants: [
              ...taskConstants(
                entries.slice(0, at + 1),
                ledger.all().filter((l) => l.binding.from === 'output').map((l) => l.value),
                Object.values(known),
              ),
            ],
          });
          if (compiled.length && e.skill) compiled[0].id = e.skill;
          skills.push(...compiled);
        } catch {
          /* a recording compile.ts cannot handle is itself a finding, but not a crash */
        }
        // Bank this instruction's values for the NEXT compile, exactly as the
        // daemon's ledger does (its report entries are post-pipeline too).
        bank([...cur.entries, ...cur.reports], `i${cur.ledgerIndex}`, values);
      }
      if (e.status !== 'success') pending = cur;
      cur = null;
    } else cur.entries.push(e);
  }
  flushPending();
  return {
    get: (id) => skills.find((s) => s.id === id) ?? null,
    list: (origin) => skills.filter((s) => s.origin === origin),
    all: () => skills,
    knownBefore,
    knownValues,
  };
}

const published = fs.existsSync(path.join(dir, `${tag}-skills`)) ? new SkillStore(path.join(dir, `${tag}-skills`)) : null;

const report = { tag, runs: [] };

for (const { runid, file } of sessions()) {
  const entries = readEntries(file);
  if (relabelModel) {
    const { relabelCases, requestRelabelPlan, applyRelabelToEntries } = await import(dist('skills/relabel.js'));
    const { OpenAICompatProvider, resolveProviderConfig } = await import(dist('agent/llm.js'));
    const llm = new OpenAICompatProvider(resolveProviderConfig({ provider: relabelProvider, model: relabelModel }));
    const { plan, dropped } = await requestRelabelPlan(llm, relabelCases(entries));
    const n = [...plan.values()].reduce((sum, m) => sum + Object.keys(m).length, 0);
    console.log(`\n[relabel] ${runid}: ${n} rename(s)${dropped.length ? `, dropped ${dropped.length} unsafe` : ''}`);
    for (const [i, m] of plan) for (const [o, nn] of Object.entries(m)) console.log(`    i${i}: ${o} -> ${nn}`);
    for (const d of dropped) console.log(`    dropped: ${d}`);
    applyRelabelToEntries(entries, plan);
  }
  // The record-time read-back pass the loop runs once captureReadBack refuses
  // (src/agent/loop.ts finish): a reported value this instruction SELECTED as
  // an option, whose click's own diff shows the control holding it, is read
  // back from that control right after the click (selectionReadBack — odoo
  // fwod82 02-create's product). Offline, "refused" is "no read of this
  // instruction returned the value": a value the live pass pinned left its
  // read in the recording.
  withSelectionReads(entries);
  const gs = groups(entries);
  const run = { runid, instructions: [], flow: null };

  // Instruction index -> the values the re-decided pipeline produced, for the
  // compile pass below. Sparse where an instruction has no report.
  const valuesByInstruction = [];
  for (const [i, g] of gs.entries()) {
    if (!g.report) continue;
    const reads = readsOf(g.steps);
    const { rebuilt, modelValues, wouldAsk, promoted } = rebuildReport(g, reads);
    valuesByInstruction[i] = rebuilt.evidence?.values ?? {};
    run.instructions.push({
      n: i + 1,
      status: g.report.status,
      instruction: g.instruction.slice(0, 60),
      reads: reads.length,
      modelNamed: Object.keys(modelValues),
      wouldAsk,
      // What the recording ACTUALLY did about the ask, once a run carries it.
      askedForReal: g.report.namingAsk ?? null,
      promoted,
      finalNames: Object.keys(rebuilt.evidence?.values ?? {}),
    });
  }

  const startUrl = startUrlOf(entries);
  const rebuilt = storeFrom(entries, { runid }, valuesByInstruction);
  // C06. The identity markers each recording compiles to, with the value each
  // slot stands for. A url pattern and a page fingerprint match EVERY record of
  // a template, so `preconditions.requireText` is the only thing that can say
  // "this is the right record" — and nothing else in this fingerprint touches
  // it, which made a change to identityOf invisible here. A marker that
  // DISAPPEARS under a tightening is one that only ever appeared EXTENDED at
  // recording time, and that is exactly what has to be listed and explained.
  run.markers = rebuilt.all().flatMap((s) =>
    (s.preconditions?.requireText ?? []).map((m) => {
      const filled = m.replace(/\{\{(\w+)\}\}/g, (_, n) => s.params?.[n]?.example ?? `{{${n}}}`);
      // Keyed by a hash of the TEMPLATE, not by the skill id: an id hashes the
      // compile's `created` stamp (store.ts), so it differs between two runs of
      // this script for reasons that have nothing to do with the code under
      // test. A hash rather than the template itself because a template is a
      // whole instruction — unreadable in a pinned baseline.
      const key = crypto.createHash('sha1').update(s.template).digest('hex').slice(0, 6);
      return `${key}:${m}${filled === m ? '' : ` = ${JSON.stringify(filled)}`}`;
    }),
  );
  const store = recompile ? rebuilt : published;
  // REBUILD_STORE_DIR=<dir>: persist the recompiled skills as a real store, so
  // a recording can be re-exported with the current engine and REPLAYED
  // (pair with REBUILD_DUMP for the flow file) without paying for a new,
  // model-driven recording of a different procedure.
  if (process.env.REBUILD_STORE_DIR && recompile && store.all) {
    const out = new SkillStore(process.env.REBUILD_STORE_DIR.replace('{runid}', runid));
    for (const s of store.all()) out.put(s);
  }
  if (startUrl && store) {
    const publishedOutputsOf = (id) => {
      const sk = store.get(id);
      if (!sk) return null;
      const chain = sk.seq ? store.list(sk.origin).filter((s) => s.seq?.chain === sk.seq.chain) : [sk];
      return chain.flatMap((s) => publishedOutputs(s, chain));
    };
    const flow = buildFlow(entries, {
      name: tag,
      origin: new URL(startUrl).origin,
      startUrl,
      vars: { runid },
      session: runid,
      // The daemon binds at export against the WHOLE ledger (server.ts
      // knownValues), and threads each slot by its recorded origin.
      bind: (id, instr) => {
        const sk = store.get(id);
        const bound = sk ? bindSkill(sk, instr, rebuilt.knownValues()) : null;
        if (process.env.REBUILD_TRACE) {
          console.error(`  bind ${id}: skill=${sk ? 'found' : 'MISSING'} params=${bound ? JSON.stringify(Object.keys(bound)) : 'NULL'}`);
          if (sk && !bound) console.error(`    template: ${sk.template}\n    params: ${JSON.stringify(sk.params)}\n    instr: ${instr}`);
        }
        return bound;
      },
      origins: (id) => {
        const sk = store.get(id);
        return sk ? Object.fromEntries(Object.entries(sk.params).flatMap(([k, p]) => (p.binding ? [[k, p.binding]] : []))) : null;
      },
      pinned: (id) => store.get(id) ?? null,
    });
    if (flow) {
      const text = JSON.stringify(flow);
      // REBUILD_DUMP=<file>: write the rebuilt flow itself, so a moved number
      // can be read as a diff of the flow rather than guessed at.
      if (process.env.REBUILD_DUMP) fs.writeFileSync(process.env.REBUILD_DUMP.replace('{runid}', runid), JSON.stringify(flow, null, 2));
      run.flow = {
        steps: flow.steps.length,
        adopted: flow.steps.filter((s) => s.adopted).map((s) => s.id),
        refs: histogram(text.match(/\{\{[^}]*\}\}/g) ?? []),
        crossStepRefs: (text.match(/\{\{\d\d-[^}]*\}\}/g) ?? []).length,
        outputs: Object.fromEntries(flow.steps.map((s) => [s.id, s.outputs ?? []])),
        lint: [...staleInstructionIds(entries, flow), ...lintFlowRefs(flow, publishedOutputsOf)],
      };
    }
  }
  report.runs.push(run);
}

/** A read target reduced the way report.ts's slug() reduces it, for spotting backfilled names. */
function slugLike(target) {
  return target.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}

function histogram(list) {
  const h = {};
  for (const x of list) h[x] = (h[x] ?? 0) + 1;
  return Object.fromEntries(Object.entries(h).sort((a, b) => b[1] - a[1]));
}

// ---- output -----------------------------------------------------------------

for (const run of report.runs) {
  console.log(`\n=== ${run.runid} ===`);
  for (const ins of run.instructions) {
    console.log(
      `  ${String(ins.n).padStart(2)} ${ins.status.padEnd(7)} reads=${String(ins.reads).padStart(2)}  ` +
        `model-named=[${ins.modelNamed.join(',')}]  would-ask=[${ins.wouldAsk.join(' | ')}]  ` +
        `backfilled=[${ins.promoted.join(',')}]`,
    );
    if (ins.askedForReal) {
      console.log(`      recorded ask: asked=[${ins.askedForReal.asked.join(' | ')}] named=${ins.askedForReal.named}`);
    }
  }
  if (run.flow) {
    console.log(`  flow: ${run.flow.steps} step(s), ${run.flow.crossStepRefs} cross-step reference(s)` + (run.flow.adopted.length ? `, adopted [${run.flow.adopted.join(',')}]` : ''));
    console.log(`  refs: ${JSON.stringify(run.flow.refs)}`);
    for (const [id, outs] of Object.entries(run.flow.outputs)) console.log(`    ${id} publishes [${outs.join(',')}]`);
    for (const w of run.flow.lint) console.log(`  lint: ${w}`);
  } else {
    console.log('  flow: not rebuilt (no start url, or no published skill store for this tag)');
  }
}

/** The numbers a recording-path change is allowed to move, and must not move the wrong way. */
const summary = {
  tag,
  runs: report.runs.map((r) => ({
    runid: r.runid,
    instructions: r.instructions.length,
    withModelNames: r.instructions.filter((i) => i.modelNamed.length).length,
    wouldAsk: r.instructions.filter((i) => i.wouldAsk.length).length,
    crossStepRefs: r.flow?.crossStepRefs ?? null,
    stepsPublishing: r.flow ? Object.values(r.flow.outputs).filter((o) => o.length).length : null,
    // A flow's step COUNT is part of what a recording compiles to: adoption
    // (resolveGroups) exists precisely to change it, and a silent gain or loss
    // of a step is the kind of move this gate is for.
    flowSteps: r.flow?.steps ?? null,
    adoptedSteps: r.flow ? r.flow.adopted.length : null,
    // The identity gate itself, not just what the flow wires together.
    markers: r.markers ?? [],
  })),
};
console.log(`\n${JSON.stringify(summary, null, 2)}`);

if (writeBaseline && baselineFile) {
  fs.mkdirSync(path.dirname(path.resolve(baselineFile)), { recursive: true });
  fs.writeFileSync(path.resolve(baselineFile), JSON.stringify(summary, null, 2) + '\n');
  console.log(`\n[rebuild] baseline written to ${baselineFile}`);
} else if (baselineFile) {
  const want = JSON.parse(fs.readFileSync(path.resolve(baselineFile), 'utf8'));
  const got = summary;
  if (JSON.stringify(want) === JSON.stringify(got)) {
    console.log('\n[rebuild] MATCHES baseline — this change does not alter what these recordings compile to');
    process.exit(0);
  }
  console.log('\n[rebuild] DIFFERS from baseline:');
  for (const [i, w] of want.runs.entries()) {
    const g = got.runs[i];
    if (!g) {
      console.log(`  ${w.runid}: missing`);
      continue;
    }
    for (const k of ['instructions', 'withModelNames', 'wouldAsk', 'crossStepRefs', 'stepsPublishing', 'flowSteps', 'adoptedSteps']) {
      if (w[k] !== g[k]) console.log(`  ${w.runid}.${k}: ${w[k]} -> ${g[k]}`);
    }
    for (const m of w.markers ?? []) if (!(g.markers ?? []).includes(m)) console.log(`  ${w.runid}.markers LOST: ${m}`);
    for (const m of g.markers ?? []) if (!(w.markers ?? []).includes(m)) console.log(`  ${w.runid}.markers GAINED: ${m}`);
  }
  process.exit(1);
}
