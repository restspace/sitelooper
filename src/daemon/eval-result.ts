import { ambiguousCredentialsIn, rewriteLiteralCredentials, scrubSecrets } from '../shared/secrets.js';

/**
 * What an eval RETURNED, as the recorder keeps it (RecordedStep.evalResult).
 *
 * The recorder kept a tool's result only for read and read_all, whose values
 * become assertions and published outputs. So what the model learned through
 * eval could only be guessed from the expression afterwards: fwgt10's seed
 * titles, fwsi7's "Click here to view" href and fwec12's API-fetched ids were
 * all inferred from its text, and the phase-A audit of 2,503 recorded evals
 * could not say which reported values came from one. Kept as evidence only:
 * nothing replays, compiles, mints or reads back from it (see
 * RecordedStep.evalResult).
 *
 * Bounded, because an eval is often a page dump (`document.body.innerText`,
 * outerHTML): 2,000 characters keep every probe's answer we sampled while a
 * dump costs the script no more than a diff does.
 *
 * Never a credential. The tool result is already scrubbed of every secret the
 * session resolved from a marker (scrubSecrets); an UNAMBIGUOUS credential
 * variable's value standing in it is rewritten to its `{{env:NAME}}` marker,
 * as a literal fill's is (FIX AH); and a value a credential variable shares with
 * a plain one (odoo's `admin` is APP_PASSWORD and the login) cannot be told
 * apart in a string, so the whole result is withheld rather than risk it.
 */
export const EVAL_RESULT_MAX_CHARS = 2_000;

/** Stored instead of a result that holds an ambiguous credential value. */
export const EVAL_RESULT_WITHHELD = '(withheld: it holds the value of a credential variable)';

export function evalResultForRecord(result: string, env: NodeJS.ProcessEnv = process.env): string {
  const marked = rewriteLiteralCredentials(scrubSecrets(result), env).value;
  if (ambiguousCredentialsIn(marked, env).length) return EVAL_RESULT_WITHHELD;
  // Cut after the rewrite, never before: a cut through a secret would leave a
  // prefix no rewrite recognises.
  if (marked.length <= EVAL_RESULT_MAX_CHARS) return marked;
  return `${marked.slice(0, EVAL_RESULT_MAX_CHARS)}… (+${marked.length - EVAL_RESULT_MAX_CHARS} chars)`;
}
