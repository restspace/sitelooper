# Verify report: round46

Commit: `dc58c297b28c56c359a1e8fc1828632a6ea78a7d` (`dc58c297 round 46 (pending cloud verification): fixes from round 45, plus two CLI bugs`)

## a. Main suite — `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  103 passed | 11 skipped (114)
     Tests  2141 passed | 292 skipped (2433)
```

No failures.

## b. Browser tests — `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed | 112 passed | 1 skipped (114)
     Tests  1 failed | 2315 passed | 117 skipped (2433)
```

1 failing test:

**`test/browser.test.ts > script recording (fixture page) > records the index the dispatch used, and a full chain, when the step acts on ONE of several matches`**

```
AssertionError: expected { …(4) } to deeply equal { …(4) }

- Expected
+ Received

  {
    "chain": [
      {
        "kind": "css",
+       "nth": 0,
        "selector": ".ghost",
+     },
+     {
+       "kind": "css",
+       "selector": "#ghosts > p:nth-of-type(1)",
+     },
+     {
+       "h": 18,
+       "kind": "point",
+       "role": null,
+       "tag": "p",
+       "vh": 900,
+       "vw": 1280,
+       "w": 1264,
+       "x": 640,
+       "y": 392,
      },
    ],
-   "expr": "page.locator('.ghost')",
+   "expr": "page.locator('.ghost').nth(0)",
    "raw": ".ghost",
-   "verified": false,
+   "verified": true,
  }

 ❯ test/browser.test.ts:546:61
    544|     await run('read_all', { target: '.ghost', what: 'text' });
    545|     const plural = recorder.entries.at(-1);
```

## c. Parity tests — `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 failed (1)
     Tests  1 failed | 116 passed (117)
```

1 failing test:

**`test/execution-parity.test.ts > execution parity (daemon replay vs emitted artifact) > derived values across a second redirect > both runners bind the same value off a goto whose destination redirects once more`**

```
AssertionError: the artifact log: hop:start-5, visit:start-5, hop:final-5: expected [] to deeply equal [ 'mark:start-5' ]

- Expected
+ Received

- [
-   "mark:start-5",
- ]
+ []

 ❯ test/execution-parity.test.ts:3942:74
    3940|       const emittedMarks = entries(emittedLog, 'mark');
    3941|       expect(replayMarks, `replay log: ${replayLog.join(', ')}`).toHav…
    3942|       expect(emittedMarks, `the artifact log: ${emittedLog.join(', ')}…
    3943|       expect(entries(emittedLog, 'visit')).toEqual(entries(replayLog, …
    3944|       expect(entries(replayLog, 'hop')[0]).toBe('hop:start-5');
```

## d/e. Corpus check — `node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Row count: 268 (previous snapshot `r43-4fa1125c.json`: 256 rows)
- Rows changed status (present in both, `status` differs): **0**
- New rows (runid not present in the r43 snapshot): 12
  - `fwrd82` → compiled
  - `fwod78` → compiled
  - `fwgr67` → compiled
  - `fwkb38` → compiled
  - `fwop8` → compiled
  - `fwop9` → compiled
  - `fwgt5` → refused
  - `fwvk6` → compiled
  - `fwec6` → compiled
  - `fwec7` → compiled
  - `fwsi6` → compiled
  - `fwgh8` → compiled
- Rows present in r43 but missing from this run: 0

No runid regressed from `compiled` to `refused`/`error`.

New corpus snapshot copied to `bench/corpus-snapshots/r46-dc58c297.json`.

## Overall: FAIL

a and d/e are clean, but b and c each have one failing test, so the PASS bar ("a-c have 0 failures") is not met.
