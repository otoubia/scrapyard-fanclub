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
  rce_url text,
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
insert into robots (name, slug, weight_class, weapon_type, description, rce_url, active) values
  ('Maccabot',       'maccabot',       '30lb Featherweight',    'Spinner',       'Team Scrap Yard''s 30lb featherweight spinner.',                                          'https://www.robotcombatevents.com/groups/2570/resources/20462', true),
  ('Trampoline',     'trampoline',     '1lb Plastic Antweight', 'Spinner',       'A bot that likes to bounce. Overall record: 32-31. Two-time 1st place finisher.',        'https://www.robotcombatevents.com/groups/2570/resources/9751',  true),
  ('Control Freak',  'control-freak',  '1lb Antweight',         'Control Bot',   'Antweight control bot. Overall record: 25-9. 1st place at GSCRL Mechanical Mayhem.',     'https://www.robotcombatevents.com/groups/2570/resources/16240', true),
  ('Split Decision', 'split-decision', '3lb Beetleweight',      'Hammer Spinner','Beetleweight with a wiiiiide hammer saw design.',                                         'https://www.robotcombatevents.com/groups/2570/resources/23819', true),
  ('Power Off',      'power-off',      '1lb Antweight',         'Spinner',       'Antweight spinner. Overall record: 4-8.',                                                 'https://www.robotcombatevents.com/groups/2570/resources/9233',  true),
  ('Power On',       'power-on',       '3lb Beetleweight',      'Spinner',       'Beetleweight spinner. 5th place at GSCRL April Annihilation 2026.',                      'https://www.robotcombatevents.com/groups/2570/resources/12089', true),
  ('Joyful Timeline','joyful-timeline','1lb Antweight',         'Spinner',       'Antweight spinner. 2nd place at GSCRL April Annihilation 2026 (14.25 pts).',             'https://www.robotcombatevents.com/groups/2570/resources/24396', true),
  ('Twitch',         'twitch',         '150g Fairyweight',      'Spinner',       'Mini impulse fairyweight spinner. 1st place at GSCRL April Annihilation 2026.',          'https://www.robotcombatevents.com/groups/2570/resources/21147', true),
  ('TinkerBot',      'tinkerbot',      '150g Fairyweight',      'Unknown',       'Fairyweight competitor. 2nd place at GSCRL Mechanical Mayhem 2026.',                     'https://www.robotcombatevents.com/groups/2570/resources/18253', true),
  ('Sarissa',        'sarissa',        '1lb Antweight',         'Wedge Spinner', 'Cool Thagomizer. Antweight wedge spinner.',                                               'https://www.robotcombatevents.com/groups/2570/resources/21148', true),
  ('Last Minute',    'last-minute',    '1lb Plastic Antweight', 'Spinner',       'Plastic antweight spinner. 3rd place at GSCRL April Annihilation 2026.',                 'https://www.robotcombatevents.com/groups/2570/resources/11960', true),
  ('Last Second',    'last-second',    '150g Fairyweight',      'Spinner',       'Fairyweight spinner. 3rd place at GSCRL April Annihilation 2026.',                       'https://www.robotcombatevents.com/groups/2570/resources/26988', true),
  ('Fart',           'fart',           '1lb Antweight',         'Spinner',       'Antweight spinner competing in the GSCRL circuit.',                                       'https://www.robotcombatevents.com/groups/2570/resources/25978', true)
on conflict (slug) do nothing;
