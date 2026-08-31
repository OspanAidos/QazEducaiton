-- QazEducation — панель конкурсной комиссии.
-- Выполнить ПОСЛЕ admin-panel.sql и application-wizard.sql.
--
-- Что даёт:
-- 1) отдельную роль члена комиссии;
-- 2) отдельные оценки каждого эксперта;
-- 3) комиссия видит только заявки, переданные ей администратором;
-- 4) комиссия видит мотивацию, аттестат/транскрипт, ЕНТ и прочие документы;
-- 5) удостоверение личности закрыто и на уровне metadata, и на уровне Storage;
-- 6) эксперты не видят оценки друг друга;
-- 7) администратор видит все оценки комиссии.

-- 1. Члены комиссии ----------------------------------------------------------
create table if not exists public.commission_members (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table public.commission_members enable row level security;

drop policy if exists "Комиссия: видеть свою роль" on public.commission_members;
create policy "Комиссия: видеть свою роль"
  on public.commission_members for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Админ: видеть членов комиссии" on public.commission_members;
create policy "Админ: видеть членов комиссии"
  on public.commission_members for select
  using ((select public.is_admin()));

create or replace function public.is_commission_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.commission_members c
    where c.user_id = (select auth.uid())
      and c.active = true
  );
$$;

revoke all on function public.is_commission_member() from public;
grant execute on function public.is_commission_member() to authenticated;


-- 2. Какие заявки комиссия может видеть -------------------------------------
-- Чтение: evaluation / final / result.
create or replace function public.can_commission_read_application(
  p_application_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_commission_member()
    and exists (
      select 1
      from public.applications a
      where a.id = p_application_id
        and a.status in ('evaluation', 'final', 'result')
    );
$$;

revoke all on function public.can_commission_read_application(uuid) from public;
grant execute on function public.can_commission_read_application(uuid)
  to authenticated;

-- Запись оценки: только пока заявка в evaluation / final.
create or replace function public.can_commission_score_application(
  p_application_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_commission_member()
    and exists (
      select 1
      from public.applications a
      where a.id = p_application_id
        and a.status in ('evaluation', 'final')
    );
$$;

revoke all on function public.can_commission_score_application(uuid) from public;
grant execute on function public.can_commission_score_application(uuid)
  to authenticated;


-- 3. Безопасная выдача заявки комиссии --------------------------------------
-- Не возвращаем user_id, ФИО, телефон, дату рождения, удостоверение личности.
-- Комиссия получает только данные, необходимые для конкурсной оценки.
create or replace function public.get_commission_applications()
returns table (
  application_id uuid,
  number text,
  status text,
  submitted_at timestamptz,
  category text,
  support_type text,
  university text,
  specialty text,
  motivation text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id as application_id,
    a.number::text,
    a.status::text,
    a.submitted_at,
    nullif(a.data ->> 'category', '') as category,
    nullif(a.data ->> 'support_type', '') as support_type,
    nullif(a.data ->> 'university', '') as university,
    nullif(a.data ->> 'specialty', '') as specialty,
    nullif(a.data ->> 'motivation', '') as motivation
  from public.applications a
  where public.is_commission_member()
    and a.status in ('evaluation', 'final', 'result')
  order by a.submitted_at nulls last, a.number;
$$;

revoke all on function public.get_commission_applications() from public;
grant execute on function public.get_commission_applications()
  to authenticated;


-- 4. Индивидуальные оценки экспертов ----------------------------------------
create table if not exists public.commission_scores (
  application_id  uuid not null references public.applications(id) on delete cascade,
  reviewer_id     uuid not null references auth.users(id) on delete cascade,
  score           numeric(5,2) not null check (score >= 0 and score <= 100),
  comment         text,
  evaluated_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (application_id, reviewer_id)
);

alter table public.commission_scores enable row level security;

-- Член комиссии видит только СВОЮ оценку.
drop policy if exists "Комиссия: читать свою оценку" on public.commission_scores;
create policy "Комиссия: читать свою оценку"
  on public.commission_scores for select
  using (
    reviewer_id = (select auth.uid())
    and (select public.is_commission_member())
  );

drop policy if exists "Комиссия: добавить свою оценку" on public.commission_scores;
create policy "Комиссия: добавить свою оценку"
  on public.commission_scores for insert
  with check (
    reviewer_id = (select auth.uid())
    and (select public.can_commission_score_application(application_id))
  );

drop policy if exists "Комиссия: изменить свою оценку" on public.commission_scores;
create policy "Комиссия: изменить свою оценку"
  on public.commission_scores for update
  using (
    reviewer_id = (select auth.uid())
    and (select public.can_commission_score_application(application_id))
  )
  with check (
    reviewer_id = (select auth.uid())
    and (select public.can_commission_score_application(application_id))
  );

-- Администратор видит все оценки, но не подменяет оценку эксперта.
drop policy if exists "Админ: читать оценки комиссии" on public.commission_scores;
create policy "Админ: читать оценки комиссии"
  on public.commission_scores for select
  using ((select public.is_admin()));

drop trigger if exists commission_scores_touch_updated_at
  on public.commission_scores;
create trigger commission_scores_touch_updated_at
  before update on public.commission_scores
  for each row execute function public.touch_updated_at();

create index if not exists commission_scores_application_idx
  on public.commission_scores(application_id);


-- 5. Metadata документов -----------------------------------------------------
-- Комиссия может получить metadata только НЕперсональных документов
-- и только по переданным ей заявкам.
drop policy if exists "Комиссия: читать документы для оценки"
  on public.application_documents;
create policy "Комиссия: читать документы для оценки"
  on public.application_documents for select
  using (
    kind not in ('identity', 'birth_certificate', 'guardian_identity', 'guardian_consent')
    and (select public.can_commission_read_application(application_id))
  );


-- 6. Storage: удостоверение закрыто физически --------------------------------
-- Функция проверяет, что storage_path действительно принадлежит документу,
-- который разрешён комиссии.
create or replace function public.is_commission_document_allowed(
  p_storage_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_commission_member()
    and exists (
      select 1
      from public.application_documents d
      join public.applications a on a.id = d.application_id
      where d.storage_path = p_storage_path
        and d.kind not in ('identity', 'birth_certificate', 'guardian_identity', 'guardian_consent')
        and a.status in ('evaluation', 'final', 'result')
    );
$$;

revoke all on function public.is_commission_document_allowed(text) from public;
grant execute on function public.is_commission_document_allowed(text)
  to authenticated;

drop policy if exists "Комиссия: читать разрешенные файлы заявок"
  on storage.objects;
create policy "Комиссия: читать разрешенные файлы заявок"
  on storage.objects for select
  using (
    bucket_id = 'application-docs'
    and (select public.is_commission_document_allowed(name))
  );


-- 7. Администратор может увидеть имена членов комиссии -----------------------
-- Выдаём display_name через безопасную таблицу commission_members.
-- Доступ участникам к этой таблице не добавляется.

-- Пример добавления эксперта:
-- 1) Authentication -> Users -> Create user.
-- 2) Скопировать UUID.
-- 3) Выполнить:
--
-- insert into public.commission_members (user_id, display_name)
-- values ('UUID_ЭКСПЕРТА', 'ФИО эксперта')
-- on conflict (user_id) do update
-- set display_name = excluded.display_name,
--     active = true;
