/**
 * Turns a bench task file into the steps the e2e arm's test runs.
 *
 * The task is a goal with numbered objectives, the same file every other arm
 * is given. e2e is a test framework: something has to write the test. To keep
 * that authorship out of our hands, the test is DERIVED from the task text by
 * this file, one `agent.act` per objective with the objective's own wording,
 * and nothing app-specific is added. The rest of the task (the objective list
 * and the environment notes) goes to the agent as context.
 *
 * An objective is one of three shapes, decided from its wording alone:
 *   state        "A post titled … exists"            act, then agent.assert
 *   state+report "… cost 100. Report the price …"    act, assert, agent.extract
 *   report       "Report the titles of …"            act (go and look), extract
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TASKS = path.resolve(here, '..', 'tasks');

/** bench/tasks/<target>-*.md for a target. */
export function taskFile(target) {
  const hit = fs.readdirSync(TASKS).filter((f) => f.startsWith(`${target}-`) && f.endsWith('.md'));
  if (hit.length !== 1) throw new Error(`expected one task file for "${target}" under bench/tasks, found ${hit.length}`);
  return path.join(TASKS, hit[0]);
}

const section = (text, heading) => {
  const m = text.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
};

/** Numbered items of the Objectives section, continuation lines joined. */
function objectives(text) {
  const out = [];
  for (const line of section(text, 'Objectives').split('\n')) {
    const head = line.match(/^(\d+)\.\s+(.*)$/);
    if (head) out.push({ n: Number(head[1]), text: head[2].trim() });
    else if (/^\s+\S/.test(line) && out.length) out[out.length - 1].text += ` ${line.trim()}`;
  }
  return out;
}

/** Split an objective into the state it asks for and the report it asks for. */
function shape(text) {
  if (!/\breport\b/i.test(text)) return { state: text, report: '' };
  const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
  const at = sentences.findIndex((s) => /\breport\b/i.test(s));
  // "Report the titles …" and "In the project …, report the subjects …" ask for
  // nothing but a report; "The ticket ends in Ready. … report what was required"
  // asks for a state first.
  return { state: sentences.slice(0, at).join(' '), report: text };
}

export function loadTask(target) {
  const raw = fs.readFileSync(taskFile(target), 'utf8');
  const title = (raw.match(/^# (.*)$/m) ?? [, target])[1];
  const items = objectives(raw).map((o) => ({ ...o, ...shape(o.text) }));
  if (!items.length) throw new Error(`no objectives parsed from ${taskFile(target)}`);
  const context = [
    `${title}. This test works through the goal below one numbered objective per step.`,
    'RUNID stands for this run\'s id; each step names it.',
    '',
    'Objectives:',
    ...items.map((o) => `${o.n}. ${o.text}`),
    '',
    'Notes on the environment:',
    section(raw, 'Notes on the environment'),
  ].join('\n');
  return { title, objectives: items, context };
}
