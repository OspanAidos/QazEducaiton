-- QazEducation — таблица заявок (этап «личный кабинет»).
-- Одна строка на пользователя: статус, номер заявки, прогресс.
-- Выполните в Supabase SQL Editor после schema.sql.

-- 1. Таблица заявок ----------------------------------------------------------
create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users (id) on delete cascade,
  -- Человекочитаемый номер заявки, напр. QE-2026-000042
  number        text unique,
  -- Единая шкала статусов конкурса
  status        text not null default 'draft',
  -- Прогресс заполнения заявки 0..100 (считается на фронте, хранится тут)
  progress      integer not null default 0 check (progress between 0 and 100),
  -- Дедлайн текущего действия (может отсутствовать)
  deadline      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Допустимые статусы (единая шкала).
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (
  status in (
    'draft',            -- Черновик
    'awaiting_payment', -- Ожидается оплата
    'ready_to_submit',  -- Готова к отправке
    'submitted',        -- Подана
    'tech_review',      -- Техническая проверка
    'needs_fixes',      -- Требуются исправления
    'accepted',         -- Допущена
    'evaluation',       -- Оценка комиссии
    'final',            -- Финал
    'result',           -- Результат
    'appeal',           -- Апелляция
    'contract'          -- Договор
  )
);

-- 2. Row Level Security ------------------------------------------------------
alter table public.applications enable row level security;

drop policy if exists "Заявка: чтение своей" on public.applications;
create policy "Заявка: чтение своей"
  on public.applications for select
  using (auth.uid() = user_id);

drop policy if exists "Заявка: изменение своей" on public.applications;
create policy "Заявка: изменение своей"
  on public.applications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Заявка: создание своей" on public.applications;
create policy "Заявка: создание своей"
  on public.applications for insert
  with check (auth.uid() = user_id);

-- 3. Автосоздание заявки при появлении профиля -------------------------------
-- Номер формата QE-2026-NNNNNN на основе серии.
create sequence if not exists public.application_seq start 1;

create or replace function public.handle_new_application()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.applications (user_id, number, status, progress)
  values (
    new.id,
    'QE-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.application_seq')::text, 6, '0'),
    'draft',
    0
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Создаём заявку сразу при регистрации пользователя.
drop trigger if exists on_auth_user_created_application on auth.users;
create trigger on_auth_user_created_application
  after insert on auth.users
  for each row execute function public.handle_new_application();

-- 4. updated_at --------------------------------------------------------------
drop trigger if exists applications_touch_updated_at on public.applications;
create trigger applications_touch_updated_at
  before update on public.applications
  for each row execute function public.touch_updated_at();
