-- Migrate from custom PIN/password auth to Supabase Auth.
-- Existing rows are dropped (early-stage, no production data).

truncate table activity, holdings, draft_state, players, leagues restart identity cascade;

-- leagues: replace admin password with admin user reference
alter table leagues
  drop column if exists admin_password_hash,
  add column if not exists admin_user_id uuid not null references auth.users(id) on delete cascade;
create index if not exists leagues_admin_user_idx on leagues(admin_user_id);

-- players: replace pin/reset with auth user reference + email
drop index if exists players_pin_unique_per_league;
drop index if exists players_reset_token_idx;
alter table players
  drop column if exists pin_hash,
  drop column if exists pin_reset_token,
  drop column if exists reset_token_used,
  add column if not exists auth_user_id uuid not null references auth.users(id) on delete cascade,
  add column if not exists email text;
create unique index if not exists players_user_unique_per_league on players(league_id, auth_user_id);
create index if not exists players_auth_user_idx on players(auth_user_id);
