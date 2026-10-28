#!/usr/bin/env python3
"""Summarise the /api/v1 traffic in Playwright traces and in Apache's access log.

    python3 api-summary.py trace <trace.zip>...     per trace: calls, statuses, lowest X-RateLimit-Remaining
    python3 api-summary.py access <access.log>      per minute: /api/ requests, 429s

Answers one question: did the UI's own API calls hit Snipe-IT's rate limit (API_THROTTLE_PER_MINUTE)?
Standard library only.
"""
import collections, json, re, sys, zipfile


def header(headers, name):
    for h in headers or []:
        if h.get("name", "").lower() == name:
            return h.get("value")
    return None


def trace(paths):
    for path in paths:
        print(f"== {path}")
        try:
            z = zipfile.ZipFile(path)
        except Exception as e:  # noqa: BLE001
            print(f"  cannot open: {e}")
            continue
        rows, limits = [], set()
        for name in z.namelist():
            if not name.endswith(".network"):
                continue
            for line in z.read(name).decode("utf-8", "replace").splitlines():
                try:
                    ev = json.loads(line)
                except ValueError:
                    continue
                snap = ev.get("snapshot") if ev.get("type") == "resource-snapshot" else None
                if not snap:
                    continue
                url = snap.get("request", {}).get("url", "")
                if "/api/" not in url:
                    continue
                res = snap.get("response", {}) or {}
                rem = header(res.get("headers"), "x-ratelimit-remaining")
                lim = header(res.get("headers"), "x-ratelimit-limit")
                if lim:
                    limits.add(lim)
                rows.append((snap.get("startedDateTime", ""), res.get("status"), rem,
                             snap.get("request", {}).get("method", ""), url, snap.get("time")))
        rows.sort()
        statuses = collections.Counter(r[1] for r in rows)
        rems = [int(r[2]) for r in rows if r[2] is not None and str(r[2]).lstrip("-").isdigit()]
        print(f"  api calls: {len(rows)}  statuses: {dict(statuses)}  "
              f"lowest X-RateLimit-Remaining: {min(rems) if rems else 'none seen'}  "
              f"X-RateLimit-Limit: {sorted(limits) or 'none seen'}")
        for started, status, rem, method, url, ms in rows:
            ms_s = f"{ms:.0f}ms" if isinstance(ms, (int, float)) else "?"
            print(f"  {started}  {status}  remaining={rem}  {ms_s:>7}  {method} {url}")


LINE = re.compile(r'\[(\d+/\w+/\d+:\d+:\d+):\d+ [^\]]*\] "(\w+) (\S+)[^"]*" (\d{3})')


def access(path):
    per_min = collections.OrderedDict()
    total = collections.Counter()
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            m = LINE.search(line)
            if not m:
                continue
            minute, _method, url, status = m.groups()
            total[status] += 1
            if "/api/" not in url:
                continue
            b = per_min.setdefault(minute, collections.Counter())
            b["api"] += 1
            b[status] += 1
    print(f"== {path}")
    print(f"  all requests by status: {dict(total)}")
    print("  minute (UTC)        /api/ calls  429s  statuses")
    for minute, b in per_min.items():
        st = {k: v for k, v in b.items() if k != "api"}
        print(f"  {minute}  {b['api']:>11}  {b.get('429', 0):>4}  {st}")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in ("trace", "access"):
        sys.exit(__doc__)
    trace(sys.argv[2:]) if sys.argv[1] == "trace" else access(sys.argv[2])
