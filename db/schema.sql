-- Release Radar · Neon Postgres schema. Run once: Neon console → SQL Editor → paste → Run.

create table if not exists repos (
  id serial primary key,
  owner text not null,
  name text not null,
  category text not null default 'dependency' check (category in ('dependency','evaluating')),
  why text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists repos_owner_name_uq on repos (lower(owner), lower(name));

create table if not exists team (
  id serial primary key,
  name text not null,
  email text not null unique,
  role text,
  active boolean not null default true
);

create table if not exists runs (
  id serial primary key,
  kind text not null check (kind in ('weekly','daily-security','manual')),
  window_days int not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  repos_checked int,
  releases_found int,
  gemini_input_tokens int default 0,
  gemini_output_tokens int default 0,
  cost_inr numeric(10,4) default 0,
  emailed boolean default false,
  errors jsonb
);

create table if not exists releases (
  id serial primary key,
  repo_id int not null references repos(id) on delete cascade,
  tag text not null,
  title text,
  body text,
  url text,
  published_at timestamptz,
  prerelease boolean not null default false,
  source text not null default 'release' check (source in ('release','tag','advisory')),
  bump text,                                   -- MAJOR | MINOR | PATCH | UNKNOWN
  rule_flags text[] not null default '{}',     -- SECURITY, BREAKING (from code)
  ai_flags text[] not null default '{}',       -- from Gemini
  flags text[] not null default '{}',          -- final = rules OR ai
  priority text check (priority in ('HIGH','MEDIUM','LOW','NOT_SURE')),
  confidence numeric(3,2),
  summary jsonb,                               -- ["bullet","bullet"]
  why text,                                    -- "Why this colour?"
  action text,                                 -- upgrade now | plan upgrade | no action
  first_seen_at timestamptz not null default now(),
  unique (repo_id, tag)
);
create index if not exists releases_published_idx on releases (published_at desc);

create table if not exists digests (
  id serial primary key,
  run_id int references runs(id) on delete set null,
  kind text not null,
  window_days int not null,
  window_from timestamptz not null,
  window_to timestamptz not null,
  created_at timestamptz not null default now(),
  briefing jsonb,                              -- [{priority, text}]
  counts jsonb,                                -- {HIGH, MEDIUM, LOW, NOT_SURE, quiet, prerelease_hidden}
  payload jsonb not null                       -- full digest for rendering
);
create index if not exists digests_created_idx on digests (created_at desc);

create table if not exists tickets (
  id serial primary key,
  release_id int not null unique references releases(id) on delete cascade,
  status text not null default 'open' check (status in ('open','in_progress','fixed','dismissed')),
  priority text not null,
  assignee_id int references team(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  fixed_at timestamptz
);
create index if not exists tickets_status_idx on tickets (status);

create table if not exists ticket_events (
  id serial primary key,
  ticket_id int not null references tickets(id) on delete cascade,
  at timestamptz not null default now(),
  by_name text,
  action text not null,                        -- created | assigned | status | note | emailed
  detail text
);

create table if not exists star_snapshots (
  id serial primary key,
  repo_id int not null references repos(id) on delete cascade,
  stars int not null,
  taken_at timestamptz not null default now()
);
create index if not exists stars_repo_idx on star_snapshots (repo_id, taken_at desc);

create table if not exists evals (
  id serial primary key,
  created_at timestamptz not null default now(),
  results jsonb not null,
  input_tokens int, output_tokens int
);
