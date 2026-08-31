-- QazEducation — Telegram OIDC auth
-- Выполнить ОДИН РАЗ в Supabase SQL Editor.
--
-- Telegram OIDC уже должен быть настроен как custom:telegram.
-- Этот SQL только подготавливает public.profiles.

alter table public.profiles
  add column if not exists telegram_user_id bigint,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_username text,
  add column if not exists telegram_photo_url text,
  add column if not exists telegram_connected_at timestamptz;

create unique index if not exists profiles_telegram_user_id_unique
  on public.profiles(telegram_user_id)
  where telegram_user_id is not null;

create index if not exists profiles_telegram_username_idx
  on public.profiles(telegram_username)
  where telegram_username is not null;

-- Участник уже имеет RLS-доступ к своей строке profiles.
-- Фронтенд после успешного Telegram OIDC синхронизирует:
-- first_name, last_name, phone, telegram_user_id, telegram_username,
-- telegram_photo_url и telegram_connected_at.
--
-- Bot Token здесь НЕ хранится.
