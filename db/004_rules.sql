-- Release Radar · 004: the rubric — the terms that decide a colour, editable
-- from the dashboard. One row. Null columns fall back to the defaults in code.
-- Run after schema.sql. Safe to re-run.

create table if not exists rule_config (
  id int primary key default 1 check (id = 1),
  security_terms text[],
  breaking_terms text[],
  ignore_terms   text[],
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into rule_config (id) values (1) on conflict (id) do nothing;
