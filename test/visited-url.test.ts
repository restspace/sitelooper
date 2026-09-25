/**
 * Round 60, ghost fwgh14 rule A: a url part the step VISITED is that step's
 * output at its label.
 *
 * n1's 02-create typed its post into Ghost's editor, whose autosave routed the
 * page to `…/ghost/#/editor/post/6ab55426…` (script line 28), and then went back
 * to the posts list (line 35) — so the step ENDED on `#/posts`. buildFlow
 * minted url outputs only from a step's end url, so no `{{02-create.url.h2}}`
 * existed, and 03-open's slot v3 (s_9433ad, origin `url:i2:h2`, used only in
 * its url expectation) was exported as n1's literal id. n2's replay opened
 * n2's own post, and the url gate refused it for not being n1's (18 turns).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordedEntry } from '../src/daemon/recorder.js';
import { routeAt, visitedUrlPart } from '../src/execution/url.js';
import { buildFlow, urlOutputs } from '../src/skills/flow.js';

const G = 'http://127.0.0.1:8099/ghost';

describe('routeAt / visitedUrlPart', () => {
  it('names a part by the route before it, never by its own value', () => {
    expect(routeAt(`${G}/#/editor/post/6ab55426050a19000152eab7`, 'h2')).toBe(routeAt(`${G}#/editor/post/6ab55506050a19000152eac7`, 'h2'));
    expect(routeAt(`${G}/#/editor/post/X`, 'h2')).not.toBe(routeAt(`${G}/#/settings/staff/X`, 'h2'));
    expect(routeAt(`${G}/#/posts`, 'h2')).toBeNull();
  });

  it('the end url wins when it carries the label on the recorded route', () => {
    const route = routeAt(`${G}/#/editor/post/A`, 'h2')!;
    expect(visitedUrlPart([`${G}/#/editor/post/A`], `${G}/#/editor/post/B`, 'h2', route)).toBe('B');
    // ...but not on another route (round 62, vikunja fwvk13: 02-create ended
    // on /projects/2/5, whose p1 is the project, not the task it visited).
    expect(visitedUrlPart([`${G}/#/editor/post/A`], `${G}/#/settings/staff/C`, 'h2', route)).toBe('A');
    // With no route recorded, the end url's part as before.
    expect(visitedUrlPart([`${G}/#/editor/post/A`], `${G}/#/settings/staff/C`, 'h2', undefined)).toBe('C');
  });

  it('otherwise the LAST url of the step on the recorded route: a record backed out of for another is not published', () => {
    const route = routeAt(`${G}/#/editor/post/A`, 'h2')!;
    const trail = [`${G}/#/posts`, `${G}/#/editor/post`, `${G}/#/editor/post/X`, `${G}/#/posts`, `${G}/#/editor/post/Y`, `${G}/#/settings/staff/Z`, `${G}/#/posts`];
    expect(visitedUrlPart(trail, `${G}/#/posts`, 'h2', route)).toBe('Y');
    // no route recorded: the end url only, as before
    expect(visitedUrlPart(trail, `${G}/#/posts`, 'h2', undefined)).toBeUndefined();
    expect(visitedUrlPart([`${G}/#/posts`], `${G}/#/posts`, 'h2', route)).toBeUndefined();
  });
});

describe('buildFlow threads a part the producer visited but did not end on (fwgh14)', () => {
  const entries = (): RecordedEntry[] =>
    fs
      .readFileSync(path.join(__dirname, 'fixture', 'fwgh14-n1-script.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RecordedEntry);
  const ID = '6ab55426050a19000152eab7';
  const flow = () =>
    buildFlow(entries(), {
      name: 'fwgh14',
      origin: 'http://127.0.0.1:8099',
      startUrl: `${G}/`,
      vars: { runid: 'fwgh14-n1' },
      session: 'fwgh14-n1',
      now: '2026-09-24T00:00:00Z',
      // s_9433ad as published: its slots' examples and recorded origins
      bind: (skill) => (skill === 's_9433ad' ? { v1: 'fwgh14-n1', v2: 'Excerpt for bench post fwgh14-n1.', v3: ID } : null),
      origins: (skill) => (skill === 's_9433ad' ? { v1: 'var:runid', v3: 'url:i2:h2' } : null),
      // ...and the pinned skill itself, as the daemon's export passes it
      pinned: (skill) => (skill === 's_9433ad' ? JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture', 'fwgh14-skills', 's_9433ad.json'), 'utf8')) : null),
    })!;

  it('03-open binds the post id to 02-create, never n1’s literal', () => {
    const f = flow();
    const open = f.steps.find((s) => s.id.endsWith('-open') && s.skill === 's_9433ad')!;
    expect(open.params?.v3).toBe('{{02-create.url.h2}}');
  });

  it('02-create publishes url.h2 from the editor url it visited, on that route', () => {
    const create = flow().steps.find((s) => s.id === '02-create')!;
    expect(create.recorded['url.h2']).toBe(ID);
    expect(create.urlRoutes?.['url.h2']).toBe(routeAt(`${G}/#/editor/post/${ID}`, 'h2'));
  });

  it('a step that ends on the label keeps its end-url output (03-open ends on the editor)', () => {
    const f = flow();
    const open = f.steps.find((s) => s.skill === 's_9433ad')!;
    expect(open.urlRoutes?.['url.h2']).toBeUndefined();
    expect(urlOutputs(`${G}/#/editor/post/${ID}`)['url.h2']).toBe(ID);
  });
});

describe("the daemon's flow runner publishes it (server.ts captureUrlOutputs)", () => {
  it('a consumed part the step visited comes from its trail, without waiting on the end url', async () => {
    const { captureUrlOutputs } = await import('../src/daemon/server.js');
    const route = routeAt(`${G}/#/editor/post/A`, 'h2')!;
    const page = { url: () => `${G}/#/posts`, waitForURL: async () => {} } as never;
    const started = Date.now();
    const trail = [`${G}/#/posts`, `${G}/#/editor/post/B`, `${G}/#/posts`];
    const out = await captureUrlOutputs(page, new Set(['url.h2']), '02-create', undefined, trail, { 'url.h2': route });
    expect(out['url.h2']).toBe('B');
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
