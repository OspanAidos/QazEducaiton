-- QazEducation — админ-панель, проверка заявок, решения и очередь уведомлений.
-- Выполнить ПОСЛЕ:
--   1) schema.sql
--   2) applications.sql
--   3) application-wizard.sql
--
-- После выполнения создайте отдельного пользователя-администратора
-- в Supabase Authentication → Users и добавьте его UUID:
--
-- insert into public.admin_users (user_id)
-- values ('UUID_АДМИНИСТРАТОРА')
-- on conflict (user_id) do nothing;

-- 1. Администраторы -----------------------------------------------------------
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Админ: видеть свою роль" on public.admin_users;
create policy "Админ: видеть свою роль"
  on public.admin_users for select
  using ((select auth.uid()) = user_id);

-- Функция проверки роли. SECURITY DEFINER используется только для RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;


-- 2. Публичный для участника итог заявки -------------------------------------
alter table public.applications
  add column if not exists decision text,
  add column if not exists result_published_at timestamptz;

alter table public.applications
  drop constraint if exists applications_decision_check;

alter table public.applications
  add constraint applications_decision_check
  check (
    decision is null
    or decision in ('grant', 'scholarship', 'top30', 'reserve', 'not_selected')
  );


-- 3. Служебная карточка проверки — только для админа -------------------------
create table if not exists public.application_reviews (
  application_id   uuid primary key references public.applications(id) on delete cascade,
  commission_score numeric(5,2) check (
    commission_score is null or (commission_score >= 0 and commission_score <= 100)
  ),
  admin_notes      text,
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.application_reviews enable row level security;

drop policy if exists "Админ: читать проверки" on public.application_reviews;
create policy "Админ: читать проверки"
  on public.application_reviews for select
  using ((select public.is_admin()));

drop policy if exists "Админ: добавлять проверки" on public.application_reviews;
create policy "Админ: добавлять проверки"
  on public.application_reviews for insert
  with check ((select public.is_admin()));

drop policy if exists "Админ: менять проверки" on public.application_reviews;
create policy "Админ: менять проверки"
  on public.application_reviews for update
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Админ: удалять проверки" on public.application_reviews;
create policy "Админ: удалять проверки"
  on public.application_reviews for delete
  using ((select public.is_admin()));

drop trigger if exists application_reviews_touch_updated_at on public.application_reviews;
create trigger application_reviews_touch_updated_at
  before update on public.application_reviews
  for each row execute function public.touch_updated_at();


-- 4. Админ получает доступ к заявкам, профилям и документам -------------------
drop policy if exists "Админ: читать все профили" on public.profiles;
create policy "Админ: читать все профили"
  on public.profiles for select
  using ((select public.is_admin()));

drop policy if exists "Админ: читать все заявки" on public.applications;
create policy "Админ: читать все заявки"
  on public.applications for select
  using ((select public.is_admin()));

drop policy if exists "Админ: менять все заявки" on public.applications;
create policy "Админ: менять все заявки"
  on public.applications for update
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Админ: читать все документы" on public.application_documents;
create policy "Админ: читать все документы"
  on public.application_documents for select
  using ((select public.is_admin()));

-- Приватный Storage остаётся приватным.
-- Админ может читать application-docs и создавать временные signed URL.
drop policy if exists "Админ: читать файлы заявок" on storage.objects;
create policy "Админ: читать файлы заявок"
  on storage.objects for select
  using (
    bucket_id = 'application-docs'
    and (select public.is_admin())
  );


-- 5. Платежи: если таблица payments уже существует, даём админу доступ --------
do $$
begin
  if to_regclass('public.payments') is not null then
    execute 'drop policy if exists "Админ: читать все платежи" on public.payments';
    execute 'create policy "Админ: читать все платежи"
      on public.payments for select
      using ((select public.is_admin()))';

    execute 'drop policy if exists "Админ: менять платежи" on public.payments';
    execute 'create policy "Админ: менять платежи"
      on public.payments for update
      using ((select public.is_admin()))
      with check ((select public.is_admin()))';
  end if;
end
$$;


-- 6. История административных решений ---------------------------------------
create table if not exists public.application_admin_history (
  id              bigint generated by default as identity primary key,
  application_id  uuid not null references public.applications(id) on delete cascade,
  changed_by      uuid references auth.users(id) on delete set null,
  old_status      text,
  new_status      text,
  old_decision    text,
  new_decision    text,
  created_at      timestamptz not null default now()
);

alter table public.application_admin_history enable row level security;

drop policy if exists "Админ: читать историю" on public.application_admin_history;
create policy "Админ: читать историю"
  on public.application_admin_history for select
  using ((select public.is_admin()));

create or replace function public.log_admin_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin()
     and (
       new.status is distinct from old.status
       or new.decision is distinct from old.decision
     )
  then
    insert into public.application_admin_history (
      application_id,
      changed_by,
      old_status,
      new_status,
      old_decision,
      new_decision
    )
    values (
      new.id,
      (select auth.uid()),
      old.status,
      new.status,
      old.decision,
      new.decision
    );
  end if;

  return new;
end;
$$;

drop trigger if exists applications_admin_history on public.applications;
create trigger applications_admin_history
  after update on public.applications
  for each row execute function public.log_admin_application_change();


-- 7. Telegram: подготовка хранения связи и очереди уведомлений ----------------
-- САМА ОТПРАВКА сообщений здесь не выполняется.
-- Её подключим через Telegram Bot + Supabase Edge Function.
alter table public.profiles
  add column if not exists telegram_user_id bigint,
  add column if not exists telegram_chat_id bigint,
  add column if not exists telegram_username text,
  add column if not exists telegram_connected_at timestamptz;

create table if not exists public.notifications (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null default 'telegram',
  event_type  text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  error_text  text
);

alter table public.notifications
  drop constraint if exists notifications_status_check;
alter table public.notifications
  add constraint notifications_status_check
  check (status in ('pending', 'processing', 'sent', 'failed'));

alter table public.notifications enable row level security;

-- Участник может видеть только историю собственных уведомлений.
drop policy if exists "Уведомления: читать свои" on public.notifications;
create policy "Уведомления: читать свои"
  on public.notifications for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Админ: читать уведомления" on public.notifications;
create policy "Админ: читать уведомления"
  on public.notifications for select
  using ((select public.is_admin()));

drop policy if exists "Админ: менять уведомления" on public.notifications;
create policy "Админ: менять уведомления"
  on public.notifications for update
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create index if not exists notifications_pending_idx
  on public.notifications (status, created_at);

create or replace function public.queue_application_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     or new.decision is distinct from old.decision
  then
    insert into public.notifications (
      user_id,
      channel,
      event_type,
      payload,
      status
    )
    values (
      new.user_id,
      'telegram',
      case
        when new.decision is distinct from old.decision
          then 'competition_result'
        else 'application_status'
      end,
      jsonb_build_object(
        'application_id', new.id,
        'application_number', new.number,
        'status', new.status,
        'decision', new.decision
      ),
      'pending'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists applications_notification_queue on public.applications;
create trigger applications_notification_queue
  after update on public.applications
  for each row execute function public.queue_application_notification();


-- 8. Индексы -----------------------------------------------------------------
create index if not exists applications_status_idx
  on public.applications (status);

create index if not exists application_documents_application_idx
  on public.application_documents (application_id);

create index if not exists application_history_application_idx
  on public.application_admin_history (application_id, created_at desc);
