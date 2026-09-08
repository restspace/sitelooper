import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// src/cli.ts imports `compileFlow` from './spec/index.js', a sibling module another
// agent is writing concurrently (see CONTRACT.md). Importing src/cli.ts here would
// execute `main()` at module load and fail on that missing import until it lands, so
// this test reads the source directly instead — a source-level check of the new
// `compile` command's arg-parsing wiring, in the same spirit as the rest of cli.ts's
// hand-rolled `parseArgv` (there is no exported parsing seam to call into).
const cliSource = fs.readFileSync(path.resolve(__dirname, '../src/cli.ts'), 'utf8');

// The repair command's diagnostics wiring. Same source-level approach as the
// compile block above and for the same reason: importing src/cli.ts runs
// main(). The judgement itself is unit-tested in spec-repair.test.ts
// (`rerecordDiagnostics`); what is checked here is that repair actually asks
// for it, prints it FIRST, refuses the write on it, and carries it in JSON.
describe('cli: repair reports a step whose RECORDING is the problem', () => {
  it('derives the flags from the run reports and the staged store, after every run', () => {
    expect(cliSource).toContain('const flagged = new Map<string, Diagnostic>();');
    expect(cliSource).toContain('const refreshFlags = (): void => {');
    expect(cliSource).toContain('rerecordDiagnostics({');
    // Run 1 and every converge run: a pin can move under us between them.
    expect(cliSource.match(/^ +refreshFlags\(\);$/gm)?.length).toBe(2);
  });

  it('keeps WHICH skill replayed in the run report, not only how well it went', () => {
    expect(cliSource).toContain('...(st.replayed ? { replayed: st.replayed } : {}),');
    expect(cliSource).toContain('...(st.repinned ? { repinned: st.repinned } : {}),');
  });

  it('prints the diagnostics before the counts and the change list', () => {
    const flags = cliSource.indexOf('  refreshFlags();');
    const counts = cliSource.indexOf('drift ticket(s) → ${summary.promoted.length} promoted');
    const changes = cliSource.indexOf("printChanges('--- changes ---', diff);");
    expect(flags).toBeGreaterThan(0);
    expect(counts).toBeGreaterThan(flags);
    expect(changes).toBeGreaterThan(flags);
  });

  it('refuses the write and exits 1 — the existing "needs re-record" code', () => {
    const from = cliSource.indexOf('const gateRerecord = (): void => {');
    expect(from).toBeGreaterThan(0);
    const gate = cliSource.slice(from, cliSource.indexOf('let changed = [', from));
    expect(gate).toContain("refused: 'needs re-record'");
    expect(gate).toContain('wrote: null');
    expect(gate).toContain('formatDiagnostic(d)');
    expect(gate).toContain("printChanges('--- changes (not written) ---', diff);");
    expect(gate).toContain('process.exit(1);');
    // Before the write, and before --dry-run's own report.
    const call = cliSource.indexOf('  gateRerecord();');
    expect(call).toBeGreaterThan(from);
    expect(call).toBeLessThan(cliSource.indexOf('fs.writeFileSync(outFile, emitted.source);'));
    expect(call).toBeLessThan(cliSource.indexOf('if (dryRun) {'));
  });

  it('does not let the convergence gate exit 3 on a step no further run can clear', () => {
    expect(cliSource).toContain('const bad = notConverged(check, dryRun ? undefined : staged.store, flagged);');
    expect(cliSource).toContain('const others = bad.filter(');
    expect(cliSource).toContain('if (others.length) {');
  });

  it('puts the diagnostics in every JSON shape, via the shared report()', () => {
    expect(cliSource).toContain('diagnostics: [...flagged.values()],');
  });

  it('never lets --check-spec blame the emitter for a flagged step', () => {
    const check = cliSource.indexOf('liveReplayPassed: true,');
    expect(check).toBeGreaterThan(0);
    expect(cliSource.slice(check, check + 600)).toContain('flagged,');
  });
});
