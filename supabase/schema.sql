-- Team Scrap Yard Fan Club — Supabase Schema
-- Run this in the Supabase SQL editor to set up your database

create extension if not exists "uuid-ossp";

-- Events
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  event_source text not null default 'manual',
  external_id text,
  status text not null default 'upcoming' check (status in ('upcoming','current','past')),
  start_date timestamptz not null,
  end_date timestamptz,
  location text,
  description text,
  results jsonb,
  truefinals_url text,
  livestream_url text,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists events_external_unique on events(event_source, external_id) where external_id is not null;

-- Robots
create table if not exists robots (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  weight_class text not null default 'Unknown',
  description text,
  weapon_type text,
  stats jsonb,
  image_url text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Robot event results
create table if not exists robot_results (
  id uuid primary key default uuid_generate_v4(),
  robot_id uuid references robots(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  wins int default 0,
  losses int default 0,
  placement text,
  is_highlight boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- Media (photos, videos, CAD)
create table if not exists media (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('photo','video','cad')),
  url text not null,
  thumbnail_url text,
  title text,
  description text,
  robot_id uuid references robots(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  is_highlight boolean default false,
  approved boolean default false,
  created_at timestamptz default now()
);

-- Posts (user submissions)
create table if not exists posts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  content text not null,
  author_name text not null,
  author_email text not null,
  media_urls text[] default '{}',
  approved boolean default false,
  created_at timestamptz default now()
);

-- Highlights (podium / prime time)
create table if not exists highlights (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  event_id uuid references events(id) on delete set null,
  robot_id uuid references robots(id) on delete set null,
  type text not null default 'other' check (type in ('podium','primetime','knockout','other')),
  media_url text,
  created_at timestamptz default now()
);

-- Enable Row Level Security (public read, service role write)
alter table events enable row level security;
alter table robots enable row level security;
alter table robot_results enable row level security;
alter table media enable row level security;
alter table posts enable row level security;
alter table highlights enable row level security;

-- Public read policies
create policy "Public read events" on events for select using (true);
create policy "Public read robots" on robots for select using (true);
create policy "Public read results" on robot_results for select using (true);
create policy "Public read approved media" on media for select using (approved = true);
create policy "Public read approved posts" on posts for select using (approved = true);
create policy "Public read highlights" on highlights for select using (true);

-- Public insert for posts (submissions)
create policy "Anyone can submit posts" on posts for insert with check (true);

-- Seed robots
insert into robots (name, slug, weight_class, weapon_type, description, active) values
  ('Maccabot', 'maccabot', '30lb', 'Unknown', 'A promising 30lb NHRL competitor. Builders: Max, Jordan, and Ilan.', true),
  ('Trampoline', 'trampoline', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Control Freak', 'control-freak', '1lb Antweight', 'Spinner', 'Antweight spinner competing on robotcombatevents.com.', true),
  ('Power Off', 'power-off', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Power On', 'power-on', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Joyful Timeline', 'joyful-timeline', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Twitch', 'twitch', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Tinkerbot', 'tinkerbot', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Sarissa', 'sarissa', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Last Minute', 'last-minute', '1lb Antweight', 'Unknown', 'Antweight competitor. Known win: pitted opponent "Sonic".', true),
  ('Last Second', 'last-second', 'Unknown', 'Unknown', 'Placeholder — add details via admin panel.', true),
  ('Split Decision', 'split-decision', '150g', 'Thwackbot', 'Heavily armoured 150g thwackbot. Survived Robonerd and multiple beetleweight fights.', true)
on conflict (slug) do nothing;
