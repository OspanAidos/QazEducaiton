-- QazEducation — авторизация участников через @QazEducationBot
-- Версия: Telegram Bot Auth v1
--
-- Что делает:
-- 1) создаёт безопасные одноразовые запросы на вход;
-- 2) хранит стабильную связь Telegram user -> auth.users;
-- 3) сохраняет telegram_chat_id для будущих уведомлений;
-- 4) позволяет при первой привязке найти существующий phone-auth аккаунт
--    и не создавать дубль.
--
-- Выполнить один раз в Supabase -> SQL Editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Telegram-поля участника
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists telegram_user_id bigint,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_username text,
  add column if not exists telegram_connected_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Стабильная связь Telegram -> Supabase Auth
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_accounts (
  telegram_user_id bigint primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  telegram_chat_id bigint not null,
  username text,
  first_name text,
  last_name text,
  phone text,
  connected_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table public.telegram_accounts enable row level security;

-- Эта таблица доступна только backend/service-role.
revoke all on table public.telegram_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Короткоживущие запросы на вход
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_auth_requests (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  status text not null default 'pending',
  lang text not null default 'ru',
  telegram_user_id bigint,
  telegram_chat_id bigint,
  auth_user_id uuid references auth.users(id) on delete cascade,
  phone text,
  auth_token_hash text,
  first_time boolean,
  failure_message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz
);

alter table public.telegram_auth_requests
  drop constraint if exists telegram_auth_requests_status_check;

alter table public.telegram_auth_requests
  add constraint telegram_auth_requests_status_check
  check (status in (
    'pending',
    'awaiting_contact',
    'approved',
    'failed',
    'expired'
  ));

create index if not exists telegram_auth_requests_token_hash_idx
  on public.telegram_auth_requests(token_hash);

create index if not exists telegram_auth_requests_tg_pending_idx
  on public.telegram_auth_requests(telegram_user_id, status, created_at desc);

create index if not exists telegram_auth_requests_expiry_idx
  on public.telegram_auth_requests(expires_at);

alter table public.telegram_auth_requests enable row level security;

revoke all on table public.telegram_auth_requests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Безопасный поиск существующего Auth-пользователя по телефону.
-- Нужен только backend service-role.
-- ---------------------------------------------------------------------------
create or replace function public.find_auth_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.phone = p_phone
  order by u.created_at asc
  limit 1
$$;

revoke all on function public.find_auth_user_by_phone(text)
  from public, anon, authenticated;

grant execute on function public.find_auth_user_by_phone(text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Профиль при создании нового Auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    phone,
    lang,
    category,
    telegram_user_id,
    telegram_chat_id,
    telegram_username,
    telegram_connected_at
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(
      nullif(new.raw_user_meta_data ->> 'phone', ''),
      new.phone
    ),
    coalesce(new.raw_user_meta_data ->> 'lang', 'ru'),
    new.raw_user_meta_data ->> 'category',
    case
      when nullif(new.raw_user_meta_data ->> 'telegram_user_id', '') is not null
        then (new.raw_user_meta_data ->> 'telegram_user_id')::bigint
      else null
    end,
    case
      when nullif(new.raw_user_meta_data ->> 'telegram_chat_id', '') is not null
        then (new.raw_user_meta_data ->> 'telegram_chat_id')::bigint
      else null
    end,
    new.raw_user_meta_data ->> 'telegram_username',
    case
      when nullif(new.raw_user_meta_data ->> 'telegram_user_id', '') is not null
        then now()
      else null
    end
  )
  on conflict (id) do update
  set
    first_name = coalesce(nullif(excluded.first_name, ''), public.profiles.first_name),
    last_name = coalesce(nullif(excluded.last_name, ''), public.profiles.last_name),
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    lang = coalesce(nullif(excluded.lang, ''), public.profiles.lang),
    telegram_user_id = coalesce(excluded.telegram_user_id, public.profiles.telegram_user_id),
    telegram_chat_id = coalesce(excluded.telegram_chat_id, public.profiles.telegram_chat_id),
    telegram_username = coalesce(excluded.telegram_username, public.profiles.telegram_username),
    telegram_connected_at = coalesce(
      excluded.telegram_connected_at,
      public.profiles.telegram_connected_at
    ),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Старые phone-auth пользователи остаются на месте.
-- Новый бот при первой привязке ищет их по auth.users.phone
-- и связывает Telegram с тем же UUID.
-- ---------------------------------------------------------------------------
