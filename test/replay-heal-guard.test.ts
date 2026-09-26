/**
 * Stage 3 Piece O, rule O (odoo fwod94 n2, round 68): a healed candidate must
 * carry what the recorded one carried. s_2a1251 step 2 recorded
 * `role=option[name="{{v1}}"]` (v1 = this run's "fwod94-n2 Bench Customer");
 * the chain missed, an inline heal proposed Odoo's `option "Create \"fwod94-n1
 * Bench\""`, and the click filed the quotation under run 1's customer. The
 * heal is now refused, and the step stops as a miss (recovery), not on the
 * wrong record. Replay-only: the compiled artifact has no inline heal.
 */
import { describe, expect, it } from 'vitest';
import type { Locator, Page } from 'playwright-core';
import { healNameRefused, replaySkill, type HealProposal, type HealRequest, type InlineHealer } from '../src/skills/replay.js';
import type { LocatorCandidate } from '../src/daemon/recorder.js';
import type { Skill, SkillStep } from '../src/skills/store.js';

process.env.SITELOOPER_RESOLVE_WAIT_MS = '0';
process.env.SITELOOPER_IDENTITY_WAIT_MS = '0';

const URL = 'http://127.0.0.1:8069/web#action=1&cids=1&menu_id=2&model=sale.order&view_type=form';
const PATTERN = 'http://127.0.0.1:8069/web#action={{d1}}&cids=:id&menu_id={{d2}}&model=sale.order&view_type=form';
const N2 = 'fwod94-n2 Bench Customer';

/** Locators counted by `kind:role:name` (role), `text:…`, or `css`; `live` is a nameless element's aria head. */
function fakePage(counts: Record<string, number>, live = ''): Page {
  const loc = (key: string): Locator =>
    ({
      count: async () => counts[key] ?? 0,
      first: () => loc(key),
      evaluate: async () => null,
      ariaSnapshot: async () => live,
      textContent: async () => '',
    }) as unknown as Locator;
  return {
    url: () => URL,
    evaluate: async () => [],
    getByTestId: (v: string) => loc(`testid:${v}`),
    // makeLocator names a role by a RegExp (roleName): match it against the counted names.
    getByRole: (role: string, o?: { name?: string | RegExp }) => {
      const name = o?.name;
      const hit = Object.keys(counts).find((k) => {
        if (!k.startsWith(`role:${role}:`)) return false;
        const shown = k.slice(`role:${role}:`.length);
        return name instanceof RegExp ? name.test(shown) : shown === (name ?? '');
      });
      return loc(hit ?? `role:${role}:?`);
    },
    getByLabel: (l: string) => loc(`label:${l}`),
    getByPlaceholder: () => loc('placeholder'),
    getByText: (t: string) => loc(`text:${t}`),
    locator: (s: string) => loc(`css:${s}`),
  } as unknown as Page;
}

/** s_2a1251's step 2, as stored (the fwod94 skill), alone: the customer option click. */
function fwod94Skill(target?: LocatorCandidate[]): Skill {
  return {
    id: 's_2a1251',
    origin: 'http://127.0.0.1:8069',
    template: "create a new quotation for customer '{{v1}}'",
    params: {
      v1: { example: 'fwod94-n1 Bench Customer', usedIn: [1], known: true, binding: 'output:i1:contact_name' },
      v2: { example: 'fwod94-n1', usedIn: [], known: true, binding: 'var:runid' },
    },
    preconditions: { urlPattern: PATTERN },
    steps: [
      {
        tool: 'click',
        args: { target: 'role=option[name="{{v1}}"]' },
        locators: {
          target: target ?? [
            { kind: 'css', selector: 'role=option[name="{{v1}}"]' },
            { kind: 'role', role: 'option', name: '{{v1}}' },
            { kind: 'css', selector: '#autocomplete_0_0' },
            { kind: 'id', selector: '#autocomplete_0_0' },
          ],
        },
        expect: { urlPattern: PATTERN },
      } as SkillStep,
    ],
    stats: { uses: 1, successes: 1, partial: 0, created: 't', failedAtStep: {}, fallthroughs: 0 },
    status: 'validated',
    provenance: { session: 's', instruction: 'i', created: 't' },
  } as Skill;
}

const PARAMS = { v1: N2, v2: 'fwod94-n2' };

function healer(candidate: LocatorCandidate, settled: boolean[] = []): InlineHealer & { asked: HealRequest[] } {
  const asked: HealRequest[] = [];
  const heal = async (req: HealRequest): Promise<HealProposal | null> => {
    asked.push(req);
    return { candidate, note: `healed inline: the step ran on ${JSON.stringify(candidate)}`, settled: (ok) => settled.push(ok) };
  };
  return Object.assign(heal, { asked });
}

const CREATE_N1: LocatorCandidate = { kind: 'role', role: 'option', name: 'Create "fwod94-n1 Bench"' };

async function run(skill: Skill, page: Page, heal: InlineHealer, params: Record<string, string> = PARAMS) {
  const clicked: string[] = [];
  const res = await replaySkill(skill, params, {
    page,
    heal,
    exec: async (tool) => {
      clicked.push(tool);
      return { result: 'ok' };
    },
  });
  return { res, clicked };
}

describe('rule O — the fwod94 shape through replay', () => {
  it("refuses the heal onto 'Create \"fwod94-n1 Bench\"' when this run's customer is absent: nothing clicked, a miss", async () => {
    const settled: boolean[] = [];
    const { res, clicked } = await run(fwod94Skill(), fakePage({ [`role:option:${CREATE_N1.name}`]: 1 }), healer(CREATE_N1, settled));
    expect(clicked).toEqual([]);
    expect(res.ok).toBe(false);
    expect(res.failedAt).toBe(1);
    expect(res.reason).toMatch(/no element matched any known locator/);
    expect(res.healed).toBeUndefined();
    expect(settled).toEqual([false]);
    expect(res.misses.at(-1)?.used).toBeNull();
    expect(res.warnings.join('\n')).toContain(
      `an inline heal proposed a option named 'Create "fwod94-n1 Bench"', for a control recorded as naming this run's '${N2}' — another record, not dispatched`,
    );
  });

  it('accepts a heal whose name carries this run’s customer (the option renamed around it)', async () => {
    const renamed: LocatorCandidate = { kind: 'role', role: 'option', name: `${N2}, Bench Co` };
    const settled: boolean[] = [];
    const { res, clicked } = await run(fwod94Skill(), fakePage({ [`role:option:${renamed.name}`]: 1 }), healer(renamed, settled));
    expect(clicked).toEqual(['click']);
    expect(res.ok).toBe(true);
    expect(res.healed).toHaveLength(1);
    expect(settled).toEqual([true]);
  });

  it('accepts a nameless heal whose live element is named by the value, refuses one that is not', async () => {
    const css: LocatorCandidate = { kind: 'css', selector: '#autocomplete_0_1' };
    const ok = await run(fwod94Skill(), fakePage({ 'css:#autocomplete_0_1': 1 }, `- option "${N2}"`), healer(css));
    expect(ok.res.ok).toBe(true);
    const bad = await run(fwod94Skill(), fakePage({ 'css:#autocomplete_0_1': 1 }, '- option "Create \\"fwod94-n1 Bench\\""'), healer(css));
    expect(bad.res.ok).toBe(false);
    expect(bad.clicked).toEqual([]);
    expect(bad.res.warnings.join('\n')).toMatch(/proposed a css named 'Create "fwod94-n1 Bench"'.*another record, not dispatched/);
  });

  it('fallback: a chain naming no known slot value heals exactly as before, whatever the proposal says', async () => {
    const plain = fwod94Skill([{ kind: 'css', selector: '#autocomplete_0_0' }, { kind: 'role', role: 'option', name: 'Bench Customer' }]);
    const { res, clicked } = await run(plain, fakePage({ [`role:option:${CREATE_N1.name}`]: 1 }), healer(CREATE_N1));
    expect(clicked).toEqual(['click']);
    expect(res.ok).toBe(true);
    expect(res.healed).toHaveLength(1);
  });
});

describe('healNameRefused — the pure rule', () => {
  const own = ['fwod94-n2'];
  it('whole token and folded: case and spacing do not matter, a glued suffix does', () => {
    expect(healNameRefused([N2], own, { kind: 'text', text: 'x' }, 'FWOD94-N2   bench customer')).toBeNull();
    expect(healNameRefused([N2], own, { kind: 'text', text: 'x' }, `${N2}s`)).toMatch(/another record/);
  });

  it("refuses a name carrying another run's runid even when it carries the value", () => {
    const why = healNameRefused(['Bench Customer'], own, { kind: 'role', role: 'option', name: 'fwod94-n1 Bench Customer' }, 'fwod94-n1 Bench Customer');
    expect(why).toBe("an inline heal proposed a option named 'fwod94-n1 Bench Customer', which carries 'fwod94-n1' — another run's value (this run is 'fwod94-n2'), not dispatched");
    expect(healNameRefused(['Bench Customer'], own, { kind: 'role', role: 'option', name: 'fwod94-n2 Bench Customer' }, 'fwod94-n2 Bench Customer')).toBeNull();
  });

  it('the runid rule needs this run’s own runid: unknown, it decides nothing', () => {
    expect(healNameRefused(['Bench Customer'], [], { kind: 'text', text: 'x' }, 'fwod94-n1 Bench Customer')).toBeNull();
  });

  it('no recorded value: null, always', () => {
    expect(healNameRefused([], own, CREATE_N1, 'Create "fwod94-n1 Bench"')).toBeNull();
  });

  it('a name that could not be read cannot show the value', () => {
    expect(healNameRefused([N2], own, { kind: 'css', selector: '#x' }, null)).toMatch(/whose name could not be read/);
  });
});
