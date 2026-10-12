-- Release Radar · 003: answer "is this actually in my codebase?"
-- Run after schema.sql. Safe to re-run.

-- A repo's npm package name, when it differs from the repo name
-- (stripe/stripe-node ships as "stripe"). Inferred if left null.
alter table repos add column if not exists package_name text;

-- Keerthi's dependencies, pasted from her package.json. Ranges only — no lockfile,
-- no source code, nothing private beyond the names she already publishes in a manifest.
create table if not exists manifest_deps (
  name text primary key,
  range text not null,
  dev boolean not null default false,
  updated_at timestamptz not null default now()
);
