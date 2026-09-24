/**
 * Phase A hygiene: the `$0` guard (repairdesk fwrd85).
 *
 * The outer model ran `sitelooper do "… Report the parts total (e.g. $0.00) …"`
 * in double quotes. The shell expanded `$0` to its own name and the recorded
 * 08-remove instruction read "total /bin/sh.00": the flow, the skill goal and
 * the compiled artifact all carried it. The CLI refuses an argument, or an
 * --stdin / --instruction-file text (an unquoted heredoc expands `$0` too),
 * that carries a shell's `$0`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shellExpansionIn, shellExpansionRefusal } from '../src/shared/shell-expansion.js';

describe('shellExpansionIn: what a shell leaves where "$0" was', () => {
  it('finds fwrd85\'s "total /bin/sh.00" and the other shells\' names', () => {
    expect(shellExpansionIn('Remove the part, then report the ticket total /bin/sh.00 and the parts count')).toBe('/bin/sh');
    expect(shellExpansionIn('the total should read /usr/bin/bash.00')).toBe('/usr/bin/bash');
    expect(shellExpansionIn('costs /bin/zsh now')).toBe('/bin/zsh');
    expect(shellExpansionIn('a total of bash.00')).toBe('bash');
    expect(shellExpansionIn('a total of -bash.00')).toBe('-bash');
  });

  it('leaves ordinary text, paths and words alone', () => {
    expect(shellExpansionIn('Report the total ($0.00 when empty)')).toBeNull();
    expect(shellExpansionIn('open /bin/shared/report and the sh.org link')).toBeNull();
    expect(shellExpansionIn('upload /home/user/bin/shell.png')).toBeNull();
    expect(shellExpansionIn('the bash and sh shells, version 5.2')).toBeNull();
    expect(shellExpansionIn('flash.00 sale')).toBeNull();
  });
});

describe('shellExpansionRefusal: every argument and the instruction text', () => {
  it('refuses a do instruction on the command line', () => {
    const message = shellExpansionRefusal(['--session', 'fwrd85-n1', 'do', 'report the total /bin/sh.00'])!;
    expect(message).toContain('"/bin/sh"');
    expect(message).toContain('$0');
    expect(message).toContain("single quotes");
    expect(message).toContain('--stdin');
    expect(message).toContain('--allow-shell-path');
  });

  it('refuses it in --instruction, note, var and --var values too', () => {
    expect(shellExpansionRefusal(['rerecord', 'fwrd85', '08-remove', '--instruction', 'total /bin/sh.00'])).not.toBeNull();
    expect(shellExpansionRefusal(['note', 'parts cost /bin/bash.00'])).not.toBeNull();
    expect(shellExpansionRefusal(['var', 'price=/bin/sh.00'])).not.toBeNull();
    expect(shellExpansionRefusal(['run', 'fwrd85', '--var', 'total=bash.00'])).not.toBeNull();
  });

  it('refuses a heredoc that expanded it (stdin or file text)', () => {
    expect(shellExpansionRefusal(['do', '--stdin'], 'report the total /bin/sh.00')).toContain('instruction text');
  });

  it('lets a --reset-cmd name a shell, and ordinary commands through', () => {
    expect(shellExpansionRefusal(['build', 'fwrd85', '--reset-cmd', '/bin/sh -c "npm run reset"'])).toBeNull();
    expect(shellExpansionRefusal(['--session', 's', 'do', 'report the total ($0.00 if empty)'])).toBeNull();
    // …but not a $0 hidden in some other argument of the same command.
    expect(shellExpansionRefusal(['build', 'fwrd85', '--reset-cmd', '/bin/sh reset.sh', '--var', 'total=/bin/sh.00'])).not.toBeNull();
  });
});

describe('cli wiring', () => {
  // Importing src/cli.ts runs main() (see test/spec-cli.test.ts), so the
  // wiring is checked in the source.
  const cli = fs.readFileSync(path.resolve(__dirname, '../src/cli.ts'), 'utf8');
  it('checks argv and any --stdin / --instruction-file text before a command runs, with an explicit override', () => {
    expect(cli).toContain("shellExpansionRefusal(process.argv.slice(2), instructionText)");
    expect(cli).toContain("'allow-shell-path'");
    const check = cli.indexOf('shellExpansionRefusal(process.argv.slice(2)');
    expect(check).toBeGreaterThan(cli.indexOf("fs.readFileSync(flags.has('stdin') ? 0"));
    expect(check).toBeLessThan(cli.indexOf("if (command === 'init')"));
  });
});
