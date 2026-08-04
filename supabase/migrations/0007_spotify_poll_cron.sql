-- Migration 0007: schedule the Spotify now-playing poller.
--
-- pg_cron invokes the spotify-poll Edge Function every 2 minutes via pg_net. The function is public
-- (no JWT) but gated by a shared secret; the secret is read from Vault so it never appears in this
-- file or in cron.job. The Vault secret `poll_secret` is created out-of-band (not committed) with
-- the same value as the function's POLL_SECRET env.
--
-- Interval is a tunable knob: 2 min balances freshness against Spotify calls and the widget's own
-- update budget. Idempotent — unschedules any prior job of the same name first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('spotify-poll');
exception when others then null; -- no existing job; ignore
end $$;

select cron.schedule(
  'spotify-poll',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://agnslitokcyvkboiklwn.supabase.co/functions/v1/spotify-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-poll-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'poll_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
