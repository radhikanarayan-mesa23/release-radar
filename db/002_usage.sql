-- Release Radar · 002: spend guards so a public demo cannot drain the AI quota.
-- Run after schema.sql. Safe to re-run.

create table if not exists usage_events (
  id bigserial primary key,
  kind text not null,              -- chat | run | eval
  ip_hash text,                    -- sha256 of client IP, never the IP itself
  at timestamptz not null default now()
);
create index if not exists usage_kind_at_idx on usage_events (kind, at desc);
create index if not exists usage_ip_at_idx on usage_events (ip_hash, at desc);
