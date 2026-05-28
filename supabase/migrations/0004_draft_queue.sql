-- Per-player draft queue. Private to each owner via RLS on auth_user_id.
create table if not exists draft_queue (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  position int not null,
  created_at timestamptz not null default now(),
  unique (player_id, ticker)
);
create index if not exists draft_queue_player_idx on draft_queue(player_id, position);
create index if not exists draft_queue_league_ticker_idx on draft_queue(league_id, ticker);

alter table draft_queue enable row level security;

do $$ begin
  create policy "owner_read_queue" on draft_queue for select using (auth.uid() = auth_user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table draft_queue;
exception when duplicate_object then null; when others then null; end $$;

-- DELETE events need REPLICA IDENTITY FULL so that the row's column values
-- (including player_id used as the Realtime filter) are included in the
-- WAL event; otherwise the player_id=eq.X channel filter can't evaluate.
alter table draft_queue replica identity full;
