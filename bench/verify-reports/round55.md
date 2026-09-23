# Verify round55

Commit: `aa83f390` (`aa83f3908fe5031d11574e9820a690858d806e61`) — "bench: verify-round55 prompt (baseline r53)"

## Overall: FAIL

a-c did not have 0 failures (6 failures shared by checks a and b, both in `test/rebuild.test.ts`, same root cause). Check d/e is clean: no runid moved from compiled to refused/error, and 10 new runids all compiled.

## a. `npx vitest run --pool=forks --poolOptions.forks.maxForks=4`

```
Test Files  1 failed | 114 passed | 12 skipped (127)
     Tests  6 failed | 2277 passed | 317 skipped (2600)
```

6 failing tests, all in `test/rebuild.test.ts > recorded-flow rebuild`, all with the identical root cause:

```
TypeError: chain.flatMap is not a function or its return value is not iterable
    at publishedOutputs (file:///home/user/sitelooper/dist/skills/learn.js:928:73)
```

### fwod24 still compiles to its pinned flow
```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwod24 --dir bench/fixtures/recordings --baseline bench/fixtures/fwod24.json
file:///home/user/sitelooper/dist/skills/learn.js:928
    const bound = new Set([...Object.keys(skill.params ?? {}), ...chain.flatMap((s) => Object.keys(s.derived ?? {}))]);
                                                                        ^

TypeError: chain.flatMap is not a function or its return value is not iterable
    at publishedOutputs (file:///home/user/sitelooper/dist/skills/learn.js:928:73)
    at Array.flatMap (<anonymous>)
    at publishedOutputsOf (file:///home/user/sitelooper/bench/rebuild-flow.mjs:381:20)
    at lintFlowRefs (file:///home/user/sitelooper/dist/skills/flow.js:1747:47)
    at file:///home/user/sitelooper/bench/rebuild-flow.mjs:416:58

Node.js v22.22.2

 ❯ publishedOutputs dist/skills/learn.js:928:73
 ❯ publishedOutputsOf bench/rebuild-flow.mjs:381:20
 ❯ lintFlowRefs dist/skills/flow.js:1747:47
 ❯ bench/rebuild-flow.mjs:416:58
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

### fwod26 still compiles to its pinned flow
```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwod26 --dir bench/fixtures/recordings --baseline bench/fixtures/fwod26.json
file:///home/user/sitelooper/dist/skills/learn.js:928
    const bound = new Set([...Object.keys(skill.params ?? {}), ...chain.flatMap((s) => Object.keys(s.derived ?? {}))]);
                                                                        ^

TypeError: chain.flatMap is not a function or its return value is not iterable
    at publishedOutputs (file:///home/user/sitelooper/dist/skills/learn.js:928:73)
    at Array.flatMap (<anonymous>)
    at publishedOutputsOf (file:///home/user/sitelooper/bench/rebuild-flow.mjs:381:20)
    at lintFlowRefs (file:///home/user/sitelooper/dist/skills/flow.js:1747:47)
    at file:///home/user/sitelooper/bench/rebuild-flow.mjs:416:58

Node.js v22.22.2

 ❯ publishedOutputs dist/skills/learn.js:928:73
 ❯ publishedOutputsOf bench/rebuild-flow.mjs:381:20
 ❯ lintFlowRefs dist/skills/flow.js:1747:47
 ❯ bench/rebuild-flow.mjs:416:58
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

### fwod27 still compiles to its pinned flow
```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwod27 --dir bench/fixtures/recordings --baseline bench/fixtures/fwod27.json
file:///home/user/sitelooper/dist/skills/learn.js:928
    const bound = new Set([...Object.keys(skill.params ?? {}), ...chain.flatMap((s) => Object.keys(s.derived ?? {}))]);
                                                                        ^

TypeError: chain.flatMap is not a function or its return value is not iterable
    at publishedOutputs (file:///home/user/sitelooper/dist/skills/learn.js:928:73)
    at Array.flatMap (<anonymous>)
    at publishedOutputsOf (file:///home/user/sitelooper/bench/rebuild-flow.mjs:381:20)
    at lintFlowRefs (file:///home/user/sitelooper/dist/skills/flow.js:1747:47)
    at file:///home/user/sitelooper/bench/rebuild-flow.mjs:416:58

Node.js v22.22.2

 ❯ publishedOutputs dist/skills/learn.js:928:73
 ❯ publishedOutputsOf bench/rebuild-flow.mjs:381:20
 ❯ lintFlowRefs dist/skills/flow.js:1747:47
 ❯ bench/rebuild-flow.mjs:416:58
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

### fwgr14 still compiles to its pinned flow
```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwgr14 --dir bench/fixtures/recordings --baseline bench/fixtures/fwgr14.json
file:///home/user/sitelooper/dist/skills/learn.js:928
    const bound = new Set([...Object.keys(skill.params ?? {}), ...chain.flatMap((s) => Object.keys(s.derived ?? {}))]);
                                                                        ^

TypeError: chain.flatMap is not a function or its return value is not iterable
    at publishedOutputs (file:///home/user/sitelooper/dist/skills/learn.js:928:73)
    at Array.flatMap (<anonymous>)
    at publishedOutputsOf (file:///home/user/sitelooper/bench/rebuild-flow.mjs:381:20)
    at lintFlowRefs (file:///home/user/sitelooper/dist/skills/flow.js:1747:47)
    at file:///home/user/sitelooper/bench/rebuild-flow.mjs:416:58

Node.js v22.22.2

 ❯ publishedOutputs dist/skills/learn.js:928:73
 ❯ publishedOutputsOf bench/rebuild-flow.mjs:381:20
 ❯ lintFlowRefs dist/skills/flow.js:1747:47
 ❯ bench/rebuild-flow.mjs:416:58
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

### fwrd35 still compiles to its pinned flow
```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwrd35 --dir bench/fixtures/recordings --baseline bench/fixtures/fwrd35.json
file:///home/user/sitelooper/dist/skills/learn.js:928
    const bound = new Set([...Object.keys(skill.params ?? {}), ...chain.flatMap((s) => Object.keys(s.derived ?? {}))]);
                                                                        ^

TypeError: chain.flatMap is not a function or its return value is not iterable
    at publishedOutputs (file:///home/user/sitelooper/dist/skills/learn.js:928:73)
    at Array.flatMap (<anonymous>)
    at publishedOutputsOf (file:///home/user/sitelooper/bench/rebuild-flow.mjs:381:20)
    at lintFlowRefs (file:///home/user/sitelooper/dist/skills/flow.js:1747:47)
    at file:///home/user/sitelooper/bench/rebuild-flow.mjs:416:58

Node.js v22.22.2

 ❯ publishedOutputs dist/skills/learn.js:928:73
 ❯ publishedOutputsOf bench/rebuild-flow.mjs:381:20
 ❯ lintFlowRefs dist/skills/flow.js:1747:47
 ❯ bench/rebuild-flow.mjs:416:58
 ❯ test/rebuild.test.ts:54:19
     52|       // Throws on a non-zero exit, and rebuild-flow.mjs exits 1 on a …
     53|       // the changed fields on stdout — which is what we want in the f…
     54|       const out = execFileSync(
       |                   ^
     55|         process.execPath,
     56|         [
```

### fwod24 pins the defect it was recorded for: the order reference named after its selector
```
Error: Command failed: /opt/node22/bin/node bench/rebuild-flow.mjs --tag fwod24 --dir bench/fixtures/recordings
file:///home/user/sitelooper/dist/skills/learn.js:928
    const bound = new Set([...Object.keys(skill.params ?? {}), ...chain.flatMap((s) => Object.keys(s.derived ?? {}))]);
                                                                        ^

TypeError: chain.flatMap is not a function or its return value is not iterable
    at publishedOutputs (file:///home/user/sitelooper/dist/skills/learn.js:928:73)
    at Array.flatMap (<anonymous>)
    at publishedOutputsOf (file:///home/user/sitelooper/bench/rebuild-flow.mjs:381:20)
    at lintFlowRefs (file:///home/user/sitelooper/dist/skills/flow.js:1747:47)
    at file:///home/user/sitelooper/bench/rebuild-flow.mjs:416:58

Node.js v22.22.2

 ❯ publishedOutputs dist/skills/learn.js:928:73
 ❯ publishedOutputsOf bench/rebuild-flow.mjs:381:20
 ❯ lintFlowRefs dist/skills/flow.js:1747:47
 ❯ bench/rebuild-flow.mjs:416:58
 ❯ test/rebuild.test.ts:72:17
     70| 
     71|   it('fwod24 pins the defect it was recorded for: the order reference …
     72|     const out = execFileSync(
       |                 ^
     73|       process.execPath,
     74|       ['bench/rebuild-flow.mjs', '--tag', 'fwod24', '--dir', 'bench/fi…
```

## b. `BP_BROWSER_TESTS=1 npx vitest run --pool=forks --poolOptions.forks.maxForks=2`

Note: the container's pre-installed Chromium (build 1194) did not match this project's pinned Playwright version (`@playwright/test ^1.61.1`, which wants build 1228). The first attempt failed all real-browser tests with `could not launch a browser ... Executable doesn't exist at /opt/pw-browsers/chromium-1228/...`. Ran `npx playwright install --with-deps chromium` (as directed in step 1) to fetch the matching build, then re-ran this check once. The result below is that single successful run.

```
Test Files  1 failed | 125 passed | 1 skipped (127)
     Tests  6 failed | 2463 passed | 131 skipped (2600)
```

Same 6 failures as check (a), same tests, same `test/rebuild.test.ts` root cause (`chain.flatMap is not a function` in `dist/skills/learn.js:928`) — not a browser-related failure. Error text identical to the blocks shown above; omitted here for brevity.

## c. `BP_PARITY_TESTS=1 npx vitest run test/execution-parity.test.ts --pool=forks --poolOptions.forks.maxForks=2`

```
Test Files  1 passed (1)
     Tests  131 passed (131)
```

No failures.

## d/e. `PWD="$(pwd)" APP_PASSWORD=bench-admin-pass node bench/corpus-check.mjs --out /tmp/v/corpus.json --quiet`

- Row count: 286 (current) vs. 276 (`bench/corpus-snapshots/r53-c923af62.json`)
- Compared by `runid`, field `status`:
  - Changed: **0**
  - New: **10**, all `compiled`:
    - fwrd87: compiled
    - fwod81: compiled
    - fwgr68: compiled
    - fwkb39: compiled
    - fwop10: compiled
    - fwgt7: compiled
    - fwvk7: compiled
    - fwec8: compiled
    - fwsi7: compiled
    - fwgh10: compiled
  - Removed (present in r53, absent now): 0

No runid went from compiled to refused/error. New corpus snapshot copied to `bench/corpus-snapshots/r55-aa83f390.json`.
