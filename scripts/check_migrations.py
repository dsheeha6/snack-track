#!/usr/bin/env python3
"""Check the repo's view of the database against what is actually deployed.

Until 2026-09-20 the 21 applied migrations existed *only* inside the Supabase
project. The repo held one edge function and a hand-maintained `db/schema.sql`,
which meant the database could not be rebuilt from the repo and nothing would
have noticed if `schema.sql` drifted from reality. `supabase/migrations/` now
holds the real history; this script is what stops it going stale again.

Three checks:

  1. Every applied migration has a file in supabase/migrations/, and every file
     corresponds to an applied migration. Names and versions must match.
  2. Every table PostgREST exposes is mentioned in db/schema.sql.
  3. Every RPC function PostgREST exposes is mentioned in db/schema.sql.

Checks 2 and 3 are inventory-level, not column-level: they catch "a table or
function exists that the repo has never heard of", which is the drift that
actually happens when changes are applied straight to the project. A real
column-by-column diff needs `pg_dump` and the database password, which we do
not have -- only the API keys.

Requires SUPABASE_SERVICE_ROLE_KEY in ../.env.local. Pure stdlib.

Usage:
    python scripts/check_migrations.py

Exit code is 0 when everything lines up, 1 otherwise, so it can gate a commit.
"""

import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
SCHEMA_SQL = ROOT / "db" / "schema.sql"

FILENAME_RE = re.compile(r"^(\d{14})_([a-z0-9_]+)\.sql$")


def load_env_local():
    """Read ../.env.local, tolerating UTF-16.

    Notepad saves UTF-16 by default and has broken this file three times; a
    plain utf-8 read dies with `UnicodeDecodeError: 0xff in position 0`, which
    reads exactly like a missing key. evals/run.py sniffs the BOM for the same
    reason. NOTE: seed_foods_usda.py and stage_branded.py still do not.
    """
    path = ROOT / ".env.local"
    if not path.exists():
        sys.exit(f"missing {path}")
    raw = path.read_bytes()
    text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8-sig")
    env = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def api(env, path, *, accept=None, post=False):
    url = env.get("SUPABASE_URL", "").rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if accept:
        headers["Accept"] = accept
    data = b"{}" if post else None
    if post:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{url}/rest/v1/{path}", data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        if e.code in (401, 403) and "applied_migrations" in path:
            sys.exit(
                "applied_migrations() refused the service_role key.\n"
                "It is created by migration 20260920214628 -- if the project was "
                f"rebuilt, re-apply that migration.\n{e.code}: {body}"
            )
        sys.exit(f"{path} -> {e.code}: {body}")


def check_migrations(env, problems):
    applied = {row["version"]: row["name"] for row in api(env, "rpc/applied_migrations", post=True)}

    on_disk = {}
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")) if MIGRATIONS_DIR.exists() else []:
        m = FILENAME_RE.match(path.name)
        if not m:
            problems.append(f"migration file does not match <version>_<name>.sql: {path.name}")
            continue
        on_disk[m.group(1)] = m.group(2)

    for version in sorted(set(applied) - set(on_disk)):
        problems.append(
            f"applied but NOT in the repo: {version}_{applied[version]} "
            f"-- the database has a change nothing tracks"
        )
    for version in sorted(set(on_disk) - set(applied)):
        problems.append(
            f"in the repo but NOT applied: {version}_{on_disk[version]} "
            f"-- either unapplied, or applied to a different project"
        )
    for version in sorted(set(applied) & set(on_disk)):
        if applied[version] != on_disk[version]:
            problems.append(
                f"name mismatch at {version}: applied '{applied[version]}', "
                f"file '{on_disk[version]}'"
            )

    print(f"migrations   {len(applied)} applied, {len(on_disk)} in repo")
    return applied, on_disk


def check_inventory(env, problems):
    spec = api(env, "", accept="application/openapi+json")
    paths = spec.get("paths", {})
    tables = sorted(p.strip("/") for p in paths if p != "/" and not p.startswith("/rpc/"))
    rpcs = sorted(p.replace("/rpc/", "") for p in paths if p.startswith("/rpc/"))

    schema_text = SCHEMA_SQL.read_text(encoding="utf-8", errors="replace").lower()
    for table in tables:
        if f"table public.{table}" not in schema_text:
            problems.append(f"table `{table}` is live but has no `create table public.{table}` in db/schema.sql")
    for rpc in rpcs:
        if f"function public.{rpc}" not in schema_text:
            problems.append(f"function `{rpc}()` is live but has no `create function public.{rpc}` in db/schema.sql")

    print(f"tables       {len(tables)} live: {', '.join(tables)}")
    print(f"functions    {len(rpcs)} live: {', '.join(rpcs)}")


def main():
    env = load_env_local()
    problems = []
    check_migrations(env, problems)
    check_inventory(env, problems)

    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)
    print("\nrepo and database agree")


if __name__ == "__main__":
    main()
