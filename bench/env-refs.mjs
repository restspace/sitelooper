/**
 * Resolve `{{env:NAME}}` references in a command an orchestrator wrote, for
 * arms whose tool has no secret handling of its own (agent-browser).
 *
 * The task files tell the model to type the password as the literal text
 * `{{env:APP_PASSWORD}}` so it never appears in a prompt or a transcript.
 * sitelooper resolves that text itself when it fills a field; agent-browser
 * typed it verbatim, and every agent-browser run since the task files moved
 * to env references failed at sign-in (abod104-luna, abkb46-luna: 0/6 in
 * under a minute). The harness resolves the reference in the command it
 * RUNS; the command it LOGS keeps the reference, and command output goes
 * through the same redaction as everything else.
 *
 * Only names in `allowed` are resolved. The value is spliced into a shell
 * command line, so a value with shell metacharacters is refused rather than
 * quoted: the bench credentials are plain words.
 */
const SHELL_SAFE = /^[A-Za-z0-9._@%+=:,\/-]+$/;

export function resolveEnvRefs(cmd, env = process.env, allowed = ['APP_PASSWORD']) {
  return cmd.replace(/\{\{env:([A-Z0-9_]+)\}\}/g, (whole, name) => {
    if (!allowed.includes(name)) return whole;
    const v = env[name];
    if (v === undefined || v === '') return whole;
    if (!SHELL_SAFE.test(v)) throw new Error(`{{env:${name}}} has a value with shell metacharacters; refusing to splice it into a command`);
    return v;
  });
}
