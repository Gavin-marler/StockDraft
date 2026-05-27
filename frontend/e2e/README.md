# E2E tests

Playwright tests that hit your real deployed Supabase backend. Tests seed users via the Supabase Admin API (bypassing the magic-link email flow), then sign in with password.

## Setup (once)

```bash
cd frontend
npm install
npm run e2e:install      # downloads Chromium
```

## Run

```bash
# From frontend/, with .env populated:
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key> npm run e2e
```

Or `--ui` for the interactive runner.

## Notes

- Seeded users are deleted at the end of each test (`auth.admin.deleteUser`).
- Created leagues are not auto-deleted. To clean up: `delete from leagues where name like 'E2E-%';`
- The service role key is loaded from `SUPABASE_SERVICE_ROLE_KEY` env var — never check it in. Get it from Supabase dashboard → Project Settings → API.
