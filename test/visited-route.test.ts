/**
 * Round 62 — vikunja fwvk13 (results/fwvk13-ks399b). test/fixture/fwvk13-n1-script.jsonl
 * is the published n1 recording.
 *
 * 02-create added the task (#28: `PUT /api/v1/projects/2/tasks`, whose
 * response the network journal records minting id 4), opened it (#29 landed
 * `/tasks/4`), wrote the description, and went back (#36 `goto
 * /projects/2/5`). It ENDED on the project list, whose url also has a `p1`
 * (the project, "2"). Round 60's visited-part rule (fwgh14) minted a part the
 * step visited only at a label the end url does not carry at all, so the
 * project's `p1` shadowed the task's; and it admitted only a referencable part,
 * which a one-digit id is not. No `{{02-create.url.p1}}` existed, 03-set's
 * slot v8 (origin `url:i2:p1`) was exported as n1's literal "4", and both
 * replays refused 03-set's start page ("expects …/tasks/4, browser is at
 * …/tasks/6" and "/tasks/8"; 16 and 34 turns).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { parseScript } from '../src/daemon/recorder.js';
import { captureUrlOutputs } from '../src/daemon/server.js';
import { routeAt, visitedUrlPart } from '../src/execution/url.js';
import { buildFlow } from '../src/skills/flow.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const V = 'http://127.0.0.1:8096';
const load = (): RecordedEntry[] => parseScript(fs.readFileSync(path.join(here, 'fixture', 'fwvk13-n1-script.jsonl'), 'utf8').replace(/\r\n/g, '\n')).entries;

const flow = () =>
  buildFlow(load(), {
    name: 'fwvk13',
    origin: V,
    startUrl: `${V}/`,
    vars: { runid: 'fwvk13-n1' },
    session: 'fwvk13-n1',
    now: '2026-09-25T00:00:00Z',
    // s_2f7cd9 as published: the slot examples and recorded origins.
    bind: (skill) => (skill === 's_2f7cd9' ? { v1: 'fwvk13-n1 Bench Task', v2: 'fwvk13-n1', v3: 'BENCH-4', v4: '/tasks/4', v5: '2026-12-31', v7: 'High', v8: '4' } : null),
    origins: (skill) =>
      skill === 's_2f7cd9' ? { v1: 'output:i2:created_task_title', v2: 'var:runid', v3: 'output:i2:task_identifier', v4: 'output:i2:task_path', v8: 'url:i2:p1' } : null,
  })!;

describe('a task id the producer visited, on a route its end url does not share (fwvk13 02-create)', () => {
  it('02-create publishes url.p1 from /tasks/4 on the tasks route, although its end url has a p1 on another', () => {
    const create = flow().steps.find((s) => s.id === '02-create')!;
    expect(create.recorded['url.p1']).toBe('4');
    expect(create.urlRoutes?.['url.p1']).toBe(routeAt(`${V}/tasks/4`, 'p1'));
  });

  it('03-set binds its start page to 02-create, never n1’s literal 4', () => {
    expect(flow().steps.find((s) => s.id === '03-set')!.params?.v8).toBe('{{02-create.url.p1}}');
  });
});

describe('the runners publish it from the trail on its route (visitedUrlPart, captureUrlOutputs)', () => {
  const route = routeAt(`${V}/tasks/4`, 'p1')!;
  const trail = [`${V}/projects/2/5`, `${V}/tasks/6`, `${V}/projects/2/5`];

  it('the end url wins only on the same route', () => {
    expect(visitedUrlPart(trail, `${V}/projects/2/5`, 'p1', route)).toBe('6');
    expect(visitedUrlPart(trail, `${V}/tasks/7`, 'p1', route)).toBe('7');
  });

  it('the daemon’s flow runner publishes the trail’s part, not the end url’s other-route one', async () => {
    const page = { url: () => `${V}/projects/2/5` } as unknown as Parameters<typeof captureUrlOutputs>[0];
    const out = await captureUrlOutputs(page, undefined, '02-create', undefined, trail, { 'url.p1': route });
    expect(out['url.p1']).toBe('6');
  });
});
