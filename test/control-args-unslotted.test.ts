import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseScript, type RecordedEntry } from '../src/daemon/recorder.js';
import { compileSkills } from '../src/skills/compile.js';

/**
 * espocrm fwec17-luna-n1 07-open, n1 script lines 198-208 verbatim. 06-open
 * had reported `cell_data_name_assignedu: "text"`, and the flow passes that
 * output on as a known value. Compile slotted it wherever the word stood as a
 * token, including the `what: "text"` of 07-open's three read-backs: the skill
 * read `what={{v4}}`, and compile refused the spec ("reads what={{v4}}, which a
 * standalone spec has no form for").
 */
let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-control-args-'));
  process.env.SITELOOPER_SKILLS_DIR = tmp;
});
afterAll(() => {
  delete process.env.SITELOOPER_SKILLS_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const text = fs.readFileSync(path.join(__dirname, 'fixture', 'fwec17-n1-07-open.jsonl'), 'utf8');

function compile() {
  const es = parseScript(text).entries.filter((e) => !(e.k === 'step' && e.failed));
  const report = es[es.length - 1] as Extract<RecordedEntry, { k: 'report' }>;
  const instruction = (es[0] as Extract<RecordedEntry, { k: 'instruction' }>).text;
  return compileSkills({
    entries: es,
    instruction,
    report: { status: 'success', summary: report.summary, evidence: { values: report.values } },
    session: 'fwec17',
    knownValues: { runid: 'fwec17-luna-n1', 'output:i6:cell_data_name_assignedu': 'text' },
  });
}

describe('a run value spelling a control word is never slotted into a control arg (fwec17 07-open)', () => {
  it('every read keeps what="text"', () => {
    const reads = compile().flatMap((s) => s.steps).filter((s) => s.tool === 'read' || s.tool === 'read_all');
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r.args.what).toBe('text');
  });

  it('no param stands for the word "text"', () => {
    for (const s of compile()) {
      const used = JSON.stringify(s.steps);
      for (const [name, p] of Object.entries(s.params ?? {})) {
        if (String(p.example) === 'text') expect(used).not.toContain(`{{${name}}}`);
      }
    }
  });
});

describe('a stored skill with a slotted control arg is repaired on load (fwec17 s_0aab2c)', () => {
  it('SkillStore reads what="text" back from what={{v4}}', async () => {
    const { SkillStore } = await import('../src/skills/store.js');
    const raw = fs.readFileSync(path.join(__dirname, 'fixture', 'fwec17-skills', 's_0aab2c.json'), 'utf8');
    expect(raw).toContain('"what": "{{v4}}"');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-control-store-'));
    try {
      const store = new SkillStore(dir);
      const origin = (JSON.parse(raw) as { origin: string }).origin;
      const originDir = (store as unknown as { originDir(o: string): string }).originDir(origin);
      fs.mkdirSync(originDir, { recursive: true });
      fs.writeFileSync(path.join(originDir, 's_0aab2c.json'), raw);
      const skill = store.list(origin).find((s) => s.id === 's_0aab2c');
      expect(skill).toBeDefined();
      const reads = skill!.steps.filter((s) => s.tool === 'read');
      expect(reads.length).toBe(3);
      for (const r of reads) expect(r.args.what).toBe('text');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
