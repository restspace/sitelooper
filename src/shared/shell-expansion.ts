/**
 * What a shell leaves where the caller wrote `$0` (repairdesk fwrd85).
 *
 * The outer model ran `sitelooper do "… report the parts total (e.g. $0.00) …"`
 * in DOUBLE quotes. The shell expanded `$0` to its own name, and the recorded
 * 08-remove instruction read "total /bin/sh.00": the flow, the skill's goal and
 * the compiled artifact all carried it, and nothing downstream can tell it was
 * never the author's text.
 *
 * `$0` is the one expansion that leaves a mark: the shell's name. It is looked
 * for as a token of its own, an absolute path to a shell (`/bin/sh`,
 * `/usr/bin/bash`, `/bin/zsh`) or a bare name directly before `.<digit>` (a login
 * shell's `-bash.00`, `bash.00`). `$1`…`$9`, `$@` and an unset `$NAME` expand to
 * nothing, and PowerShell's `"$0"` to nothing as well; "$150" arriving as "50"
 * is not detectable from the text, and is not attempted.
 */

const SHELL_PATH = /(?<![\w./-])(?:\/usr)?(?:\/local)?\/bin\/(?:ba|z|da|k|fi|tc|c|mk)?sh(?![\w/-])/;
const SHELL_NAME_BEFORE_DECIMALS = /(?<![\w./-])-?(?:ba|z|da|k)?sh(?=\.\d)/;

/** The shell `$0` became in `text`, or null. */
export function shellExpansionIn(text: string, opts: { pathsAllowed?: boolean } = {}): string | null {
  const named = SHELL_NAME_BEFORE_DECIMALS.exec(text)?.[0];
  if (named) return named;
  return opts.pathsAllowed ? null : (SHELL_PATH.exec(text)?.[0] ?? null);
}

/** Flags whose value is a command line, where naming a shell is the point. */
const COMMAND_FLAGS = new Set(['--reset-cmd']);

/**
 * Why the CLI must refuse these arguments (every one of them: an instruction,
 * `note`, `var`, `--var`, `--instruction`), or the text read from --stdin /
 * --instruction-file (an unquoted heredoc expands `$0` too), or null.
 */
export function shellExpansionRefusal(argv: readonly string[], instructionText?: string): string | null {
  let where: string | null = null;
  let shell: string | null = null;
  for (let i = 0; i < argv.length && !shell; i++) {
    const commandValue = i > 0 && COMMAND_FLAGS.has(argv[i - 1]);
    shell = shellExpansionIn(argv[i], { pathsAllowed: commandValue });
    if (shell) where = `the argument ${JSON.stringify(argv[i].length > 80 ? argv[i].slice(0, 77) + '...' : argv[i])}`;
  }
  if (!shell && instructionText !== undefined) {
    shell = shellExpansionIn(instructionText);
    if (shell) where = 'the instruction text';
  }
  if (!shell || !where) return null;
  return (
    `${where} contains ${JSON.stringify(shell)}, which is what a shell makes of "$0" inside double quotes or an unquoted heredoc ($0 is the shell's own name), ` +
    `so "$0.00" arrives as "${shell}.00" and would be recorded into the flow. Put the text in single quotes, or pass it with --stdin / --instruction-file ` +
    `(a quoted heredoc: <<'EOF'). If the text really names that shell, add --allow-shell-path.`
  );
}
