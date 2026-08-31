-- QazEducation — схема для этапа авторизации.
-- Выполните этот SQL в панели Supabase: SQL Editor → New query → Run.
--
-- Создаёт:
--   1) таблицу profiles (имя, фамилия, телефон, язык), привязанную к auth.users;
--   2) политики RLS: пользователь видит и меняет только свою строку;
--   3) триггер: при регистрации автоматически создаёт строку profiles
--      из user_metadata (first_name, last_name, phone, lang).

-- 1. Таблица профилей ---------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text,
  last_name   text,
  phone       text,
  lang        text default 'ru',
  category    text,
  privacy_accepted_at timestamptz,
  terms_accepted_at timestamptz,
  terms_version text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- 2. Row Level Security -------------------------------------------------------
alter table public.profiles enable row level security;

-- Читать свою строку
drop policy if exists "Профиль: чтение своей строки" on public.profiles;
create policy "Профиль: чтение своей строки"
  on public.profiles for select
  using (auth.uid() = id);

-- Изменять свою строку
drop policy if exists "Профиль: изменение своей строки" on public.profiles;
create policy "Профиль: изменение своей строки"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Вставлять свою строку (на случай ручного создания)
drop policy if exists "Профиль: вставка своей строки" on public.profiles;
create policy "Профиль: вставка своей строки"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 3. Автосоздание профиля при регистрации ------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, lang, category)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    coalesce(new.raw_user_meta_data ->> 'lang', 'ru'),
    new.raw_user_meta_data ->> 'category'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Поддержка updated_at -----------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
