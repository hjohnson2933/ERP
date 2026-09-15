// Runs the migration chain against a REAL Postgres (pglite = Postgres
// compiled to WASM, no server or Docker needed), so SQL is executed
// before it ever reaches the Supabase SQL Editor.
//
// This exists because `tsc` and `next build` cannot see SQL at all: a
// migration that reorders a DROP can typecheck, build, and render fine
// and still fail the moment it is run. That happened with 00017, which
// dropped a column while a view still depended on it.
//
// The database is in-memory and thrown away each run.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.join(HERE, "..", "migrations");

// Supabase provides these at runtime; a bare Postgres does not, so it
// needs stand-ins. This is ONLY what Supabase itself owns — the auth
// schema, the grant-target roles, auth.uid(), and a stub auth.users for
// the new-user trigger to attach to. Everything the ERP used to borrow
// from the mill list (the user_role enum, public.profiles / public.jobs,
// my_role()/is_editor()/is_admin(), set_updated_at(), the new-user
// trigger) is now created by migration 00000_public_baseline.sql, which
// sorts first — so the chain builds those for real rather than stubbing
// them, and this file no longer duplicates them.
//
// RLS is bypassed by the pglite superuser connection, so the real,
// profiles-backed my_role() returning null here (auth.uid() is null)
// does not affect the tested RPCs — the guards are only ever evaluated
// inside policies, which the table owner skips. run.mjs sets auth.uid()
// to a real admin profile before the section that needs one.
const BOOTSTRAP = `
create schema if not exists auth;

-- Roles the migrations grant to.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
end $$;

create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

-- Supabase's auth.users. Stub shape only — enough for 00000's new-user
-- trigger to attach and for the columns that trigger reads to exist.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
`;

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

// A fresh database with every migration applied, in order. Throws with
// the offending filename if one fails.
export async function freshDb({ log = false } = {}) {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);

  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
      if (log) console.log(`  ok    ${file}`);
    } catch (e) {
      if (log) console.log(`  FAIL  ${file}\n        ${e.message}`);
      throw new Error(`migration ${file} failed: ${e.message}`);
    }
  }
  return db;
}

// ─── Tiny assertion helpers ────────────────────────────────────
export function createChecks() {
  const results = [];

  // Compares as fixed-2 strings: Postgres numerics come back as strings,
  // and 596.7 vs "596.70" is the same money.
  const money = (n) => (n === null || n === undefined ? String(n) : Number(n).toFixed(2));

  return {
    results,
    check(name, got, want) {
      results.push({ name, got: money(got), want: money(want), ok: money(got) === money(want) });
    },
    checkRaw(name, got, want) {
      results.push({ name, got: String(got), want: String(want), ok: got === want });
    },
    report() {
      let failed = 0;
      for (const r of results) {
        if (!r.ok) failed++;
        console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
        if (!r.ok) console.log(`        got ${r.got} / want ${r.want}`);
      }
      return failed;
    },
  };
}
