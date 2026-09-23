import { describe, expect, it } from 'vitest';
import { countScopes } from '../src/execution/observe.js';
import { emitFlowFile } from '../src/spec/emit.js';
import type { SpecFlow } from '../src/spec/ir.js';
import type { SkillStep } from '../src/skills/store.js';

/**
 * Round 56, repairdesk fwrd88 05-change: a count read that resolves nothing
 * publishes "0" only when the container it counts inside is on the page.
 * countScopes names that container for each candidate; the browser half is
 * test/execution-parity.test.ts ("a count of nothing").
 */
describe('countScopes (fwrd88)', () => {
  it('counts an engine selector, a bare compound and a name across the root', () => {
    expect(countScopes([{ kind: 'css', selector: 'role=alert' }])).toEqual(['root']);
    expect(countScopes([{ kind: 'css', selector: '//p[contains(., "Status")]' }])).toEqual(['root']);
    expect(countScopes([{ kind: 'css', selector: 'li.row' }, { kind: 'id', selector: '#error-region' }])).toEqual(['root', 'root']);
    expect(countScopes([{ kind: 'role' }, { kind: 'testid' }, { kind: 'text' }])).toEqual(['root', 'root', 'root']);
  });

  it('scopes a css path by what comes before its last combinator', () => {
    expect(countScopes([{ kind: 'css', selector: '#list > li' }])).toEqual([{ selector: '#list' }]);
    expect(countScopes([{ kind: 'css', selector: 'section > div > table > tbody > tr' }])).toEqual([{ selector: 'section > div > table > tbody' }]);
    expect(countScopes([{ kind: 'css', selector: 'ul.parts li' }])).toEqual([{ selector: 'ul.parts' }]);
    // combinators inside brackets, parentheses and quotes are not the path's
    expect(countScopes([{ kind: 'css', selector: '[data-x="a > b"]' }])).toEqual(['root']);
    expect(countScopes([{ kind: 'css', selector: 'li:not(.a > .b)' }])).toEqual(['root']);
  });

  it('scopes a Playwright chain by all but its last segment, and a scoped candidate by its container', () => {
    expect(countScopes([{ kind: 'css', selector: 'role=dialog >> role=button' }])).toEqual([{ selector: 'role=dialog' }]);
    expect(countScopes([{ kind: 'css', selector: '[role=dialog] >> li >> nth=0' }])).toEqual([{ selector: 'role=dialog' }]);
    expect(countScopes([{ kind: 'scoped', container: 'tr', hasText: 'Part B', selector: 'td' }])).toEqual([{ selector: 'tr', hasText: 'Part B' }]);
  });

  it('leaves points out, and names nothing for a selector list or an unknown kind', () => {
    expect(countScopes([{ kind: 'css', selector: 'role=alert' }, { kind: 'point' }])).toEqual(['root']);
    expect(countScopes([{ kind: 'css', selector: '.a li, .b li' }])).toBeNull();
    expect(countScopes([{ kind: 'mystery' }])).toBeNull();
  });
});

describe('the artifact asks the same question (emit.ts)', () => {
  const flow = (steps: SkillStep[]): SpecFlow => ({
    version: 1,
    name: 'r56',
    origin: 'http://x.test',
    startUrl: 'http://x.test/',
    vars: [],
    steps: [{ id: '01-change', instruction: 'change', params: {}, outputs: ['alerts'], segments: [{ id: 's_r56', template: 'change', params: {}, preconditions: { urlPattern: 'http://x.test/' }, steps }] }],
  });

  it('passes a count read its scopes, and a text read none', () => {
    const { source } = emitFlowFile(
      flow([
        { tool: 'read_all', args: { target: 'role=alert', what: 'count' }, label: 'alerts', locators: { target: [{ kind: 'css', selector: 'role=alert' }] } },
        { tool: 'read_all', args: { target: 'role=alert', what: 'text' }, label: 'alert_texts', locators: { target: [{ kind: 'css', selector: 'role=alert' }] } },
      ]),
      { tier: 'plain' },
    );
    const reads = source.split('\n').filter((l) => /^\s*\], '01-change s_r56\/\d+ target'/.test(l));
    expect(reads).toHaveLength(2);
    expect(reads[0]).toContain('count: { root: page, scopes: countScopes(fillParamsDeep([{"kind":"css","selector":"role=alert"}], p) as { kind: string }[]) } }');
    expect(reads[1]).not.toContain('count:');
    expect(source).toMatch(/^async function countedNothing\(/m);
  });
});
