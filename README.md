# StockDraft

Fantasy stock league where 2–8 players draft real stocks (5-round snake draft) and compete over 3 months on portfolio return. One trade per calendar month.

- **Frontend**: Vite + React + TypeScript + Tailwind (deployed on Vercel)
- **Backend**: Supabase Postgres + Realtime + Edge Functions (Deno)
- **Auth**: Supabase Auth (email magic link)
- **Prices**: Finnhub via a cached Edge Function (1-hour TTL)

---

## Repo layout

```
fantasy-stock-draft/
├── frontend/         # Vite + React app + Playwright tests
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

1. Create a project at <https://supabase.com>. Note the **URL**, **anon key**, and **service role key**.
2. Install the Supabase CLI: `brew install supabase/tap/supabase`.
3. Link your local repo:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
4. Apply the migrations:
   ```bash
   supabase db push
   ```
5. Enable `pg_cron` and `pg_net` in the Supabase dashboard (Database → Extensions).
6. Configure the daily cron job — run this SQL in the Supabase SQL editor with your own URL and a secret you choose:
   ```sql
   select cron.alter_job(
     job_id := (select jobid from cron.job where jobname = 'finalize-stockdraft-leagues'),
     command := $cron$
       select net.http_post(
         url := 'https://<project-ref>.supabase.co/functions/v1/finalize-league',
         headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<your-cron-secret>'),
         body := '{}'::jsonb
       );
     $cron$
   );
   ```

## 3. Configure Supabase Auth

Authentication → URL Configuration:

- **Site URL**: `http://localhost:5173` (and your eventual Vercel URL — you can change this later)
- **Redirect URLs (allow-list)**: add the same URLs

Authentication → Providers → Email:

- Make sure **Enable Email provider** is on
- Magic-link / email OTP is on by default
- (Optional) Configure custom SMTP under **Auth → Email** if you expect more than ~4 sign-ups per hour. Supabase's default email is throttled.

## 4. Edge Function secrets

```bash
supabase secrets set \
  FINNHUB_API_KEY=<your-finnhub-key> \
  CRON_SECRET=<the-same-secret-you-pasted-into-the-cron-job> \
  --project-ref <your-project-ref>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime — you don't set them.

## 5. Deploy the Edge Functions

```bash
supabase functions deploy --project-ref <your-project-ref>
```

## 6. Frontend env + run

```bash
cd frontend
cp .env.example .env
# Edit .env:
#   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
#   VITE_SUPABASE_ANON_KEY=<anon key>
npm install
npm run dev   # http://localhost:5173
```

## 7. Deploy to Vercel

1. Push the repo to GitHub.
2. Create a Vercel project, set **Root Directory** = `frontend`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel → Settings → Environment Variables.
4. After deploy, add the Vercel URL to **Supabase → Authentication → URL Configuration** (Site URL + Redirect URLs).
5. Deploy.

---

## How it flows

1. **Create league** — sign in with magic link → fill out league details → get invite link.
2. **Players join** — open invite link → sign in with their own magic link → enter display name → request to join.
3. **Admin approves** — `/admin?league=...` → Pending tab → approve each.
4. **Draft starts** — admin clicks Start Draft. Invite link is rotated. All approved players land on `/draft`.
5. **Snake draft** — 5 rounds, alternating direction. 60s per pick. Timer expiry triggers auto-draft of the highest-cap undrafted ticker. Outside-top-50 tickers can be looked up via the search box.
6. **Active league** — leaderboard shows live portfolio values. Each player can trade once per calendar month (Trade button only appears on your own row).
7. **End of league** — 3 months after start, the daily pg_cron job flips status to complete and announces the winner.

---

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend `.env` + Vercel | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend `.env` + Vercel | Public anon key for reads + Realtime |
| `FINNHUB_API_KEY` | Edge Function secret | Server-side stock price fetches |
| `CRON_SECRET` | Edge Function secret + pg_cron job | Authorizes `finalize-league` calls from pg_cron |

---

## E2E tests

```bash
cd frontend
npm run e2e:install                                        # once
SUPABASE_SERVICE_ROLE_KEY=<key> npm run e2e
```

Tests seed users via the Supabase Admin API (so no email round-trip is needed) and sign in with password. See `frontend/e2e/README.md` for details.

---

## Local development

```bash
# Local Supabase stack (optional — easier to just use the cloud project):
supabase start
supabase functions serve

# Frontend:
cd frontend && npm run dev
```
