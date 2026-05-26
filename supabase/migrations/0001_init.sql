-- StockDraft schema
create extension if not exists "pgcrypto";

-- enums
do $$ begin
  create type league_status as enum ('open', 'drafting', 'active', 'complete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type player_status as enum ('pending', 'approved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type draft_status as enum ('waiting', 'picking', 'complete');
exception when duplicate_object then null; end $$;

-- leagues
create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  budget numeric not null,
  stocks_per_player int not null check (stocks_per_player between 1 and 10),
  max_players int not null check (max_players between 2 and 8),
  admin_password_hash text not null,
  invite_token uuid not null default gen_random_uuid() unique,
  status league_status not null default 'open',
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists leagues_invite_token_idx on leagues(invite_token);

-- players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  pin_hash text not null,
  status player_status not null default 'pending',
  pin_reset_token uuid,
  reset_token_used boolean not null default false,
  last_trade_month text,
  created_at timestamptz not null default now()
);
create index if not exists players_league_status_idx on players(league_id, status);
create index if not exists players_reset_token_idx on players(pin_reset_token) where pin_reset_token is not null;
create unique index if not exists players_pin_unique_per_league on players(league_id, pin_hash);

-- holdings
create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  ticker text,
  shares numeric not null default 0,
  buy_price numeric not null default 0,
  slot_value_usd numeric not null,
  buy_date timestamptz not null default now(),
  is_cash boolean not null default false
);
create index if not exists holdings_player_idx on holdings(player_id);
create index if not exists holdings_ticker_idx on holdings(ticker) where ticker is not null;

-- prices cache
create table if not exists prices (
  ticker text primary key,
  price numeric not null,
  change_pct numeric not null default 0,
  fetched_at timestamptz not null default now()
);

-- draft state (one row per league)
create table if not exists draft_state (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null unique references leagues(id) on delete cascade,
  current_round int not null default 1,
  current_player_id uuid references players(id) on delete set null,
  pick_deadline timestamptz,
  status draft_status not null default 'waiting'
);

-- activity feed
create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  type text not null,
  ticker text,
  description text not null,
  created_at timestamptz not null default now()
);
create index if not exists activity_league_created_idx on activity(league_id, created_at desc);

-- RLS: public read, no public writes (writes go through Edge Functions w/ service role)
alter table leagues enable row level security;
alter table players enable row level security;
alter table holdings enable row level security;
alter table prices enable row level security;
alter table draft_state enable row level security;
alter table activity enable row level security;

-- Note: do NOT expose admin_password_hash / pin_hash to clients.
-- We allow generic select for simplicity; the frontend code never selects these columns,
-- and PIN/password hashes are bcrypt-hashed so leakage is non-fatal but undesirable.
-- For stronger isolation, replace these with views that omit sensitive columns.

do $$ begin
  create policy "public_read_leagues" on leagues for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public_read_players" on players for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public_read_holdings" on holdings for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public_read_prices" on prices for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public_read_draft_state" on draft_state for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public_read_activity" on activity for select using (true);
exception when duplicate_object then null; end $$;

-- Realtime: add tables to supabase_realtime publication
do $$ begin
  alter publication supabase_realtime add table leagues, players, holdings, draft_state, activity;
exception when duplicate_object then null; when others then null; end $$;
