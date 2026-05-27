# E2E tests

Playwright tests that hit the real deployed Supabase backend (via your local frontend's `.env`).

## Setup (once)

```bash
cd frontend
npm install
npm run e2e:install      # downloads Chromium
```

## Run

```bash
npm run e2e              # auto-starts vite dev server, runs all specs
npm run e2e -- --ui      # interactive runner
```

## Notes

- Each test creates a fresh league with a unique name and 2 fresh players, so runs don't collide.
- Tests talk to your real Supabase project (the one your `.env` points at), so deployed Edge Functions must be live and `FINNHUB_API_KEY` must be set.
- Created leagues are **not** auto-deleted. To clean up: `delete from leagues where name like 'E2E-%';`
