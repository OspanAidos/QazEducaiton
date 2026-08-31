-- QazEducation — Блок B: данные заявки (wizard) и документы.
-- Выполнить в Supabase SQL Editor после schema.sql и applications.sql.

-- 1. Поля черновика заявки в applications -----------------------------------
-- data — произвольные поля wizard'а (мотивационное письмо, дата рождения,
-- категория на момент подачи и т.п.), хранятся как JSON.
alter table public.applications
  add column if not exists data jsonb not null default '{}'::jsonb;

-- submitted_at — момент финальной отправки (после оплаты). До неё null.
alter table public.applications
  add column if not exists submitted_at timestamptz;

-- 2. Таблица загруженных документов -----------------------------------------
create table if not exists public.application_documents (
  id            uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Тип документа заявки.
  kind          text not null,
  -- Путь файла в Storage-бакете application-docs
  storage_path  text not null,
  file_name     text,
  file_size     integer,
  created_at    timestamptz not null default now()
);

alter table public.application_documents drop constraint if exists app_docs_kind_check;
alter table public.application_documents add constraint app_docs_kind_check
  check (kind in (
    'identity',
    'birth_certificate',
    'guardian_identity',
    'guardian_consent',
    'performance',
    'ent',
    'other'
  ));

-- 3. RLS: пользователь видит и меняет только свои документы ------------------
alter table public.application_documents enable row level security;

drop policy if exists "Док: чтение своих" on public.application_documents;
create policy "Док: чтение своих"
  on public.application_documents for select using (auth.uid() = user_id);

drop policy if exists "Док: добавление своих" on public.application_documents;
create policy "Док: добавление своих"
  on public.application_documents for insert with check (auth.uid() = user_id);

drop policy if exists "Док: удаление своих" on public.application_documents;
create policy "Док: удаление своих"
  on public.application_documents for delete using (auth.uid() = user_id);

-- 4. Storage-бакет для файлов заявки ----------------------------------------
-- Приватный бакет: файлы доступны только владельцу через RLS.
insert into storage.buckets (id, name, public)
values ('application-docs', 'application-docs', false)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']::text[]
where id = 'application-docs';

-- Политики Storage: путь файла начинается с <user_id>/..., поэтому
-- пользователь работает только со своей папкой.
drop policy if exists "Файлы: чтение своих" on storage.objects;
create policy "Файлы: чтение своих"
  on storage.objects for select
  using (bucket_id = 'application-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Файлы: загрузка своих" on storage.objects;
create policy "Файлы: загрузка своих"
  on storage.objects for insert
  with check (bucket_id = 'application-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Файлы: удаление своих" on storage.objects;
create policy "Файлы: удаление своих"
  on storage.objects for delete
  using (bucket_id = 'application-docs' and (storage.foldername(name))[1] = auth.uid()::text);
