-- Telegram Bot Auth v3 — вход по короткому коду, без deep-link start
-- Выполнить один раз после telegram-bot-auth.sql.

alter table public.telegram_auth_requests
  add column if not exists login_code text;

create unique index if not exists telegram_auth_requests_login_code_uq
  on public.telegram_auth_requests(login_code)
  where login_code is not null;

create index if not exists telegram_auth_requests_login_code_pending_idx
  on public.telegram_auth_requests(login_code, status, expires_at)
  where login_code is not null;
