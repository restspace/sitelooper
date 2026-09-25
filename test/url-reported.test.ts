import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { buildFlow, consumedUrlOutputs, lintFlowRefs, urlOutputs } from '../src/skills/flow.js';

/**
 * grafana fwgr74 (round 62), n1 script instructions 1 and 7 verbatim. 01-open
 * clicked through to the provisioned dashboard and ENDED on
 * `/d/bench-service-health/service-health`, and the model reported
 * `dashboard_uid_from_url: "bench-service-health"` — read off that url, by no
 * read of the page. 07-open's instruction then quoted the uid, and export
 * threaded it as `{{01-open.dashboard_uid_from_url}}`: a reported value no
 * replay can republish (nothing in 01-open's procedure reads it). Both replays
 * fell to the model on "unresolved reference(s): 01-open.dashboard_uid_from_url"
 * and the compile refused (unsourced-ref). The url part was not minted as
 * `url.p1` because a slug does not look like an id (referencablePart), so the
 * value reached the report path instead.
 */
const entries = (): RecordedEntry[] =>
  fs
    .readFileSync(path.join(__dirname, 'fixture', 'fwgr74-n1-01-07.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RecordedEntry);

const build = (es = entries()) =>
  buildFlow(es, { name: 'fwgr74', origin: 'http://127.0.0.1:3000', startUrl: 'http://127.0.0.1:3000/', vars: { runid: 'fwgr74-n1' }, session: 's', bind: () => null })!;

describe('a reported value that is a part of the url its step ended on is published from that url (fwgr74 01-open)', () => {
  it('the later step references the url part, never the report key', () => {
    const flow = build();
    const [open, check] = flow.steps;
    expect(check.instruction).toContain(`/d/{{${open.id}.url.p1}}/service-health`);
    expect(check.instruction).not.toContain(`${open.id}.dashboard_uid_from_url`);
    expect(open.recorded['url.p1']).toBe('bench-service-health');
    // the report value itself is still what the step reported
    expect(open.recorded.dashboard_uid_from_url).toBe('bench-service-health');
  });

  it('both runners publish it: the part is consumed, and a consumed url part is published whatever it looks like', () => {
    const flow = build();
    const [open] = flow.steps;
    const wanted = consumedUrlOutputs(flow.steps).get(open.id);
    expect(wanted ? [...wanted] : []).toContain('url.p1');
    // what a replay ending where n1 ended publishes (the daemon's captureUrlOutputs, the artifact's urlPartWhen)
    const out = urlOutputs('http://127.0.0.1:3000/d/bench-service-health/service-health?from=now-6h&to=now&timezone=browser', undefined, new Set(['url.p1']));
    expect(out['url.p1']).toBe('bench-service-health');
  });

  it('the export no longer warns that only model recovery can re-observe it', () => {
    const flow = build();
    expect(lintFlowRefs(flow, () => [])).toEqual([]);
  });

  it('a reported value a read of the step returned stays the report key (the read republishes it)', () => {
    const es = entries();
    const at = es.findIndex((e) => e.k === 'step' && e.tool === 'read_all' && JSON.stringify(e).includes('main :is(h1'));
    // the step READ the uid off the page as well
    es[at] = { ...(es[at] as Extract<RecordedEntry, { k: 'step' }>), result: JSON.stringify(['bench-service-health']) };
    const flow = build(es);
    const [open, check] = flow.steps;
    expect(check.instruction).toContain(`{{${open.id}.dashboard_uid_from_url}}`);
  });
});
