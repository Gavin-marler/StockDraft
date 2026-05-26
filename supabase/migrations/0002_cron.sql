-- Daily check at 09:00 UTC for leagues past their end_date.
-- Calls the finalize-league Edge Function with the CRON_SECRET header.
-- Requires extensions pg_cron and pg_net (enable via Supabase Dashboard → Database → Extensions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Project-specific values must be set before this migration runs:
--   alter database postgres set app.settings.functions_url = 'https://<project-ref>.supabase.co/functions/v1';
--   alter database postgres set app.settings.cron_secret = '<CRON_SECRET>';

do $$ begin
  perform cron.schedule(
    'finalize-stockdraft-leagues',
    '0 9 * * *',
    $cron$
      select net.http_post(
        url := current_setting('app.settings.functions_url', true) || '/finalize-league',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.settings.cron_secret', true)
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
exception when others then
  raise notice 'Could not schedule cron job: %', sqlerrm;
end $$;
