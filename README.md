# StockDraft

Fantasy stock league where 2–8 players draft real stocks (5-round snake draft) and compete over 3 months on portfolio return. One trade per calendar month.

- **Frontend**: Vite + React + TypeScript + Tailwind (deployed on Vercel)
- **Backend**: Supabase Postgres + Realtime + Edge Functions (Deno)
- **Prices**: Finnhub via cached Edge Function (1-hour TTL)
- **Auth**: custom — admin password + 4-digit player PINs (bcrypt). Admin sessions issued as signed JWTs by an Edge Function.

---

## Repo layout

```
fantasy-stock-draft/
├── frontend/         # Vite + React app
└── supabase/
    ├── migrations/   # SQL schema + pg_cron
    └── functions/    # Deno Edge Functions
```

---

## 1. Clone

```bash
git clone <your-repo-url> fantasy-stock-draft
cd fantasy-stock-draft
```

## 2. Create the Supabase project

1. Create a project at <https://supabase.com>. Note the project **URL**, **anon key**, and **service role key**.
2. Install the Supabase CLI: `brew install supabase/tap/supabase` (or see [docs](https://supabase.com/docs/guides/cli)).
3. Link your local repo to the cloud project:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
4. Run the migrations:
   ```bash
   supabase db push
   ```
   This creates all tables (`leagues`, `players`, `holdings`, `prices`, `draft_state`, `activity`) with RLS enabled for public reads only.
5. Enable `pg_cron` and `pg_net` in the Supabase dashboard (Database → Extensions).
6. Set the Postgres settings the cron job reads (replace placeholders):
   ```sql
   alter database postgres set app.settings.functions_url = 'https://<project-ref>.supabase.co/functions/v1';
   alter database postgres set app.settings.cron_secret = '<CRON_SECRET you will set below>';
   ```

## 3. Configure Edge Function secrets

```bash
supabase secrets set \
  FINNHUB_API_KEY=<your-finnhub-key> \
  ADMIN_JWT_SECRET=$(openssl rand -hex 32) \
  CRON_SECRET=$(openssl rand -hex 32)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## 4. Deploy the Edge Functions

```bash
supabase functions deploy create-league admin-login join-league approve-player \
  reset-pin start-draft make-pick auto-draft execute-trade fetch-prices \
  finalize-league delete-league
```

> All functions are configured `verify_jwt = false` in `supabase/config.toml` — auth is enforced inside each function (admin JWT, PIN check, or invite token).

## 5. Frontend env

```bash
cd frontend
cp .env.example .env
# Edit .env:
#   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<anon key>
npm install
npm run dev   # http://localhost:5173
```

## 6. Deploy to Vercel

1. Push the repo to GitHub.
2. Create a Vercel project, point it at the `frontend/` directory (Vercel → Project Settings → Root Directory = `frontend`).
3. Add the same two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in Vercel → Settings → Environment Variables.
4. Deploy.

---

## How it flows

1. **Create league** — `/create` → admin sets password, gets invite link, admin URL, and public leaderboard URL.
2. **Players join** — visit invite link, choose name + 4-digit PIN, wait for approval.
3. **Admin approves** — `/admin?league=...` → Pending tab.
4. **Draft starts** — admin clicks Start Draft. Invite link is rotated/expired. All approved players land on `/draft`.
5. **Snake draft** — 5 rounds, alternating direction. 60s per pick. Timer expiry triggers auto-draft of the highest-cap undrafted ticker.
6. **Active league** — leaderboard shows live portfolio values. Each player can trade once per calendar month.
7. **End of league** — 3 months after start, a daily pg_cron call to `finalize-league` flips status to `complete` and announces the winner (banner + `/winner` page with confetti).

---

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend (`.env`, Vercel) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend (`.env`, Vercel) | Public anon key for reads + Realtime |
| `FINNHUB_API_KEY` | Edge Function secret | Server-side stock price fetches |
| `ADMIN_JWT_SECRET` | Edge Function secret | HMAC key for admin session JWTs |
| `CRON_SECRET` | Edge Function secret + DB setting | Authorizes `finalize-league` calls from pg_cron |

---

## Local development

```bash
# In one terminal:
supabase start                # local Supabase stack
supabase functions serve      # serves all functions on :54321

# In another:
cd frontend && npm run dev
```

For local function calls, point your frontend `.env` at the local Supabase:
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<value printed by `supabase start`>
```

Set local function secrets in `supabase/functions/.env`:
```
FINNHUB_API_KEY=...
ADMIN_JWT_SECRET=local-dev-secret
CRON_SECRET=local-dev-cron
```

---

## Notes

- **PIN hash uniqueness within a league** is enforced via a unique index on `(league_id, pin_hash)`. With bcrypt this is a collision check on the exact hash; `join-league` additionally `compare()`s the proposed PIN against each existing hash and refuses duplicates so two users can't pick the same PIN value.
- The curated ticker list (`frontend/src/data/sp500_top50.json`, mirrored in `supabase/functions/_shared/sp500.ts`) drives both the "Popular tickers" UI and the auto-draft order. Edit both when expanding the universe.
- Search lets players draft any ticker Finnhub recognizes — they aren't limited to the curated list.
- Delisted stock on trade: if Finnhub returns null for the held ticker, its slot is valued at its last recorded `slot_value_usd` so the trade can still complete. To fully realize the spec's `cash_hold` behavior (slot becomes cash, earns nothing until next trade), extend `execute-trade` to insert a fresh holding with `is_cash = true` when a delisted ticker is detected at price-refresh time.
