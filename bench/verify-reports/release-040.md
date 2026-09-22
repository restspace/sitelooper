# Verification report — release/0.4.0

**Commit:** `a47c8e5e4248b77d1cbc9f99fc179d495ee97f9e` (a47c8e5e) — "bench: release 0.4.0 verification prompt; corpus snapshot r46"

**Overall: PASS**

## a. Main suite (`npx vitest run --pool=forks --poolOptions.forks.maxForks=4`)

```
Test Files  104 passed | 11 skipped (115)
     Tests  2163 passed | 297 skipped (2460)
```

No failures.

## b. Browser suite (`BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  114 passed | 1 skipped (115)
     Tests  2339 passed | 121 skipped (2460)
```

No failures.

## c. Parity suite (`BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`)

```
Test Files  1 passed (1)
     Tests  121 passed (121)
```

No failures.

## d. Corpus check (`node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`)

268 branches checked; 18 incomplete (no flow or no store); 1 known-unfixable (reported, not scored).

**Compile rate 71.9%** (179/249 scorable) — compiled 179, refused 71, crashed 0.

By app:

| app | branches | compiled | refused | crashed | incomplete | known | rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| rd | 50 | 36 | 11 | 0 | 3 | 0 | 76.6% |
| od | 74 | 35 | 30 | 0 | 9 | 1 | 54.7% |
| gr | 65 | 37 | 22 | 0 | 6 | 0 | 62.7% |
| kb | 38 | 33 | 5 | 0 | 0 | 0 | 86.8% |
| op | 9 | 8 | 1 | 0 | 0 | 0 | 88.9% |
| gt | 5 | 3 | 2 | 0 | 0 | 0 | 60.0% |
| vk | 6 | 6 | 0 | 0 | 0 | 0 | 100.0% |
| ec | 7 | 7 | 0 | 0 | 0 | 0 | 100.0% |
| si | 6 | 6 | 0 | 0 | 0 | 0 | 100.0% |
| gh | 8 | 8 | 0 | 0 | 0 | 0 | 100.0% |

The tool's own "movement against the branch's own compile log" section (a separate, internal comparison against each branch's original record-time compile log — not the r46 snapshot) reports: fixed 5, still-refusing 22, newly-refusing 5, unchanged-ok 142, no-record 76. This is informational only; it is not the comparison step e asks for (see below).

Full row count: 268 (matches r46 snapshot row count, see e).

## e. Comparison with `bench/corpus-snapshots/r46-2623dbf9.json` (keyed by `runid`, field `status`)

- Row count old (r46): 268
- Row count new (r47): 268
- **Changed: 0** — no runid's `status` differs between r46 and r47.
- **New: 0** — no runid present in r47 that was absent from r46.
- **Missing: 0** — no runid present in r46 that is absent from r47.

No runid moved from `compiled` to `refused`/`error` between r46 and r47. (Note: the corpus-check tool's own "newly-refusing (5)" list — fwrd50, fwod52, fwgr47, fwkb8, fwkb15 — is computed against each branch's *own* original record-time compile log, not against the r46 snapshot; against r46 these branches show unchanged status.)

r47 snapshot copied to `bench/corpus-snapshots/r47-a47c8e5e.json`.

## f. `npm pack --dry-run`

- Total files: 204
- Package size: 1.1 MB
- Unpacked size: 4.1 MB
- No `notes/`, `bench/`, `src/`, or `test/` present in the tarball listing.
- Included: `CHANGELOG.md`, `README.md`, `LICENSE`, `dist/` (compiled JS + maps), `bin/sitelooper.js`.
- Also included (not forbidden): `docs/*.md`, `skills/sitelooper/SKILL.md`, `package.json`.

Does not affect PASS/FAIL (no forbidden directories present).

## g. `OPENROUTER_API_KEY=sk-or-test SITELOOPER_HOME=$(mktemp -d) node bin/sitelooper.js doctor`

```
OK    node     v22.22.2
OK    home     /tmp/tmp.XC2Xim7E1c
OK    browser  launches headless via channel chromium
OK    provider openrouter at https://openrouter.ai/api/v1 (default: OPENROUTER_API_KEY is set)
OK    model    deepseek/deepseek-v4.1-flash; escalation z-ai/glm-5.3
OK    routing  extra body {"provider":{"only":["DeepSeek"]}}: the openrouter preset's pin for deepseek/deepseek-v4.1-flash (SITELOOPER_EXTRA_BODY='{}' turns it off)
OK    api key  set

doctor: ready.
```

All checks OK, including the browser line (no failure to note on this box). Does not affect PASS/FAIL.

## Verdict

**PASS** — a, b, c all report 0 failures; e shows no runid regressed from `compiled` to `refused`/`error` (in fact 0 status changes at all) against the r46 snapshot.
