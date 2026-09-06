-- QazEducation — workflow v5
-- Три решения секретариата + доработка участником + критериальная комиссия.
-- Выполнить ОДИН РАЗ в Supabase SQL Editor после существующих SQL-файлов.

-- ---------------------------------------------------------------------------
-- 1. Статусы и служебные поля заявки
-- ---------------------------------------------------------------------------
alter table public.applications
  add column if not exists admin_status_comment text,
  add column if not exists admin_action_type text,
  add column if not exists admin_action_at timestamptz,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists resubmitted_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

alter table public.profiles
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function public.record_registration_consents(
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Требуется авторизация';
  end if;

  if nullif(trim(coalesce(p_terms_version, '')), '') is null then
    raise exception 'Не указана версия документов';
  end if;

  update public.profiles
  set
    privacy_accepted_at = accepted_at,
    terms_accepted_at = accepted_at,
    terms_version = trim(p_terms_version),
    updated_at = accepted_at
  where id = (select auth.uid());

  if not found then
    raise exception 'Профиль участника не найден';
  end if;

  return jsonb_build_object(
    'accepted_at', accepted_at,
    'terms_version', trim(p_terms_version)
  );
end;
$$;

revoke all on function public.record_registration_consents(text) from public;
grant execute on function public.record_registration_consents(text) to authenticated;

alter table public.applications
  drop constraint if exists applications_status_check;

alter table public.applications
  add constraint applications_status_check check (
    status in (
      'draft',
      'awaiting_payment',
      'ready_to_submit',
      'submitted',
      'tech_review',   -- оставлен для совместимости со старыми тестовыми заявками
      'needs_fixes',
      'accepted',      -- оставлен для совместимости
      'evaluation',
      'final',         -- оставлен для совместимости
      'rejected',
      'result',
      'appeal',
      'contract'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Редактирование участником только в разрешённых статусах
-- ---------------------------------------------------------------------------
create or replace function public.can_user_edit_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications a
    where a.id = p_application_id
      and a.user_id = (select auth.uid())
      and a.status in ('draft', 'awaiting_payment', 'ready_to_submit', 'needs_fixes')
  );
$$;

revoke all on function public.can_user_edit_application(uuid) from public;
grant execute on function public.can_user_edit_application(uuid) to authenticated;

create or replace function public.can_user_edit_own_application()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.applications a
    where a.user_id = (select auth.uid())
      and a.status in ('draft', 'awaiting_payment', 'ready_to_submit', 'needs_fixes')
  );
$$;

revoke all on function public.can_user_edit_own_application() from public;
grant execute on function public.can_user_edit_own_application() to authenticated;

drop policy if exists "Заявка: изменение своей" on public.applications;
create policy "Заявка: изменение своей"
  on public.applications for update
  using (
    (select auth.uid()) = user_id
    and status in ('draft', 'awaiting_payment', 'ready_to_submit', 'needs_fixes')
  )
  with check (
    (select auth.uid()) = user_id
    and status in ('draft', 'awaiting_payment', 'ready_to_submit', 'needs_fixes')
  );

drop policy if exists "Док: добавление своих" on public.application_documents;
create policy "Док: добавление своих"
  on public.application_documents for insert
  with check (
    (select auth.uid()) = user_id
    and (select public.can_user_edit_application(application_id))
  );

drop policy if exists "Док: удаление своих" on public.application_documents;
create policy "Док: удаление своих"
  on public.application_documents for delete
  using (
    (select auth.uid()) = user_id
    and (select public.can_user_edit_application(application_id))
  );

drop policy if exists "Файлы: загрузка своих" on storage.objects;
create policy "Файлы: загрузка своих"
  on storage.objects for insert
  with check (
    bucket_id = 'application-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.can_user_edit_own_application())
  );

drop policy if exists "Файлы: удаление своих" on storage.objects;
create policy "Файлы: удаление своих"
  on storage.objects for delete
  using (
    bucket_id = 'application-docs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.can_user_edit_own_application())
  );

-- ---------------------------------------------------------------------------
-- 3. Защищённая первая/повторная отправка заявки
-- Перед первой отправкой требуется подтверждённый организационный платёж.
-- ---------------------------------------------------------------------------
create or replace function public.submit_own_application()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  is_resubmission boolean;
  submitted_time timestamptz;
  participant_birth date;
  participant_age integer;
  foreign_allowed boolean := false;
begin
  select *
    into app
  from public.applications a
  where a.user_id = (select auth.uid())
  for update;

  if app.id is null then
    raise exception 'Заявка не найдена';
  end if;

  if app.status not in ('draft', 'awaiting_payment', 'ready_to_submit', 'needs_fixes') then
    raise exception 'Заявка сейчас недоступна для отправки';
  end if;

  if nullif(trim(app.data ->> 'birth'), '') is null
     or (app.data ->> 'birth') !~ '^\d{4}-\d{2}-\d{2}$'
     or nullif(trim(app.data ->> 'category'), '') is null then
    raise exception 'Заполните дату рождения и категорию участника';
  end if;

  begin
    participant_birth := (app.data ->> 'birth')::date;
  exception
    when others then
      raise exception 'Укажите корректную дату рождения';
  end;

  participant_age := date_part('year', age(current_date, participant_birth));

  if participant_age < 14 or participant_age > 25 then
    raise exception 'Возраст участника на дату подачи должен быть от 14 до 25 лет включительно';
  end if;

  if app.data ->> 'category' not in ('grade_9', 'grade_11', 'college', 'university', 'bachelor') then
    raise exception 'Выберите допустимую категорию участника';
  end if;

  if app.data ->> 'participant_scope' not in ('kz_citizen', 'foreign') then
    raise exception 'Выберите статус участника';
  end if;

  if app.data ->> 'participant_scope' = 'foreign'
     and nullif(trim(app.data ->> 'citizenship_country'), '') is null then
    raise exception 'Укажите страну гражданства';
  end if;

  if app.data ->> 'participant_scope' = 'foreign' then
    if to_regclass('public.competition_cycles') is not null then
      execute
        'select exists (select 1 from public.competition_cycles where id = 2026 and allows_foreign_participants = true)'
        into foreign_allowed;
    end if;

    if not foreign_allowed then
      raise exception 'В конкурсном цикле 2026 года принимаются заявки только граждан Республики Казахстан';
    end if;
  end if;

  if coalesce((app.data ->> 'consent_data')::boolean, false) is not true
     or coalesce((app.data ->> 'consent_terms')::boolean, false) is not true then
    raise exception 'Подтвердите согласие на обработку данных и принятие условий программы';
  end if;

  if nullif(trim(app.data ->> 'support_type'), '') is null
     or app.data ->> 'support_type' not in ('grant', 'scholarship') then
    raise exception 'Выберите вид поддержки';
  end if;

  if app.data ->> 'support_type' = 'grant'
     and (
       nullif(trim(app.data ->> 'university'), '') is null
       or nullif(trim(app.data ->> 'specialty'), '') is null
     ) then
    raise exception 'Для гранта необходимо выбрать университет и специальность';
  end if;

  if app.data ->> 'support_type' = 'grant'
     and lower(app.data ->> 'specialty') ~ '(медицин|стоматолог|фармац|сестрин|педиатр|общественное здоровье|ветеринар)' then
    raise exception 'Медицинские и ветеринарные образовательные программы не участвуют в грантовом треке';
  end if;

  if nullif(trim(app.data ->> 'motivation'), '') is null then
    raise exception 'Заполните мотивационное письмо';
  end if;

  if participant_age >= 18 then
    if not exists (
      select 1
      from public.application_documents d
      where d.application_id = app.id
        and d.user_id = (select auth.uid())
        and d.kind = 'identity'
    ) then
      raise exception 'Загрузите удостоверение личности';
    end if;
  else
    if not exists (
      select 1
      from public.application_documents d
      where d.application_id = app.id
        and d.user_id = (select auth.uid())
        and d.kind = 'birth_certificate'
    ) then
      raise exception 'Загрузите свидетельство о рождении';
    end if;

    if not exists (
      select 1
      from public.application_documents d
      where d.application_id = app.id
        and d.user_id = (select auth.uid())
        and d.kind = 'guardian_identity'
    ) then
      raise exception 'Загрузите документ законного представителя';
    end if;

    if not exists (
      select 1
      from public.application_documents d
      where d.application_id = app.id
        and d.user_id = (select auth.uid())
        and d.kind = 'guardian_consent'
    ) then
      raise exception 'Загрузите согласие законного представителя';
    end if;
  end if;

  if not exists (
    select 1
    from public.application_documents d
    where d.application_id = app.id
      and d.user_id = (select auth.uid())
      and d.kind in ('performance', 'academic_record')
  ) then
    raise exception 'Загрузите аттестат или транскрипт';
  end if;

  if app.status <> 'needs_fixes'
     and not exists (
       select 1
       from public.payments p
       where p.user_id = (select auth.uid())
         and p.payment_type = 'competition_fee'
         and p.status = 'paid'
     ) then
    raise exception 'Сначала оплатите организационный платеж 10 000 тенге';
  end if;

  is_resubmission := app.status = 'needs_fixes';
  submitted_time := now();

  update public.applications
  set
    status = 'submitted',
    progress = 100,
    submitted_at = submitted_time,
    resubmitted_at = case
      when is_resubmission then submitted_time
      else resubmitted_at
    end,
    deadline = null,
    terms_accepted_at = coalesce(terms_accepted_at, submitted_time),
    terms_version = coalesce(nullif(app.data ->> 'consent_version', ''), '2026-08-21-v1')
  where id = app.id;

  return jsonb_build_object(
    'application_id', app.id,
    'application_number', app.number,
    'status', 'submitted',
    'submitted_at', submitted_time,
    'resubmission', is_resubmission
  );
end;
$$;

revoke all on function public.submit_own_application() from public;
grant execute on function public.submit_own_application() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Оценка комиссии по критериям
-- ---------------------------------------------------------------------------
alter table public.commission_scores
  add column if not exists criteria_scores jsonb not null default '{}'::jsonb;

create or replace function public.validate_commission_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  support_type_value text;
  academic_value numeric;
  motivation_value numeric;
  achievements_value numeric;
  social_activity_value numeric;
  social_need_value numeric;
begin
  select nullif(a.data ->> 'support_type', '')
    into support_type_value
  from public.applications a
  where a.id = new.application_id;

  if support_type_value not in ('grant', 'scholarship') then
    raise exception 'Для заявки не определен вид поддержки';
  end if;

  begin
    academic_value := (new.criteria_scores ->> 'academic')::numeric;
    motivation_value := (new.criteria_scores ->> 'motivation')::numeric;
    achievements_value := (new.criteria_scores ->> 'achievements')::numeric;
    social_activity_value := (new.criteria_scores ->> 'social_activity')::numeric;
    social_need_value := (new.criteria_scores ->> 'social_need')::numeric;
  exception
    when others then
      raise exception 'Все критерии должны содержать числовые значения';
  end;

  if academic_value is null
     or motivation_value is null
     or achievements_value is null
     or social_activity_value is null
     or social_need_value is null then
    raise exception 'Необходимо заполнить все критерии комиссии';
  end if;

  if support_type_value = 'grant' then
    if academic_value < 0 or academic_value > 25 then
      raise exception 'Академическая успеваемость: допустимо 0-25';
    end if;
    if motivation_value < 0 or motivation_value > 30 then
      raise exception 'Мотивация и образовательные цели: допустимо 0-30';
    end if;
    if achievements_value < 0 or achievements_value > 20 then
      raise exception 'Личные достижения: допустимо 0-20';
    end if;
    if social_activity_value < 0 or social_activity_value > 10 then
      raise exception 'Социальная активность и лидерство: допустимо 0-10';
    end if;
    if social_need_value < 0 or social_need_value > 15 then
      raise exception 'Социальное положение и потребность: допустимо 0-15';
    end if;
  else
    if social_need_value < 0 or social_need_value > 30 then
      raise exception 'Социальное положение и потребность: допустимо 0-30';
    end if;
    if academic_value < 0 or academic_value > 20 then
      raise exception 'Академическая успеваемость: допустимо 0-20';
    end if;
    if motivation_value < 0 or motivation_value > 25 then
      raise exception 'Мотивация: допустимо 0-25';
    end if;
    if social_activity_value < 0 or social_activity_value > 15 then
      raise exception 'Социальная активность: допустимо 0-15';
    end if;
    if achievements_value < 0 or achievements_value > 10 then
      raise exception 'Личные достижения: допустимо 0-10';
    end if;
  end if;

  new.score :=
    academic_value
    + motivation_value
    + achievements_value
    + social_activity_value
    + social_need_value;

  return new;
end;
$$;

drop trigger if exists validate_commission_score_trigger on public.commission_scores;
create trigger validate_commission_score_trigger
  before insert or update of criteria_scores, score
  on public.commission_scores
  for each row
  execute function public.validate_commission_score();

-- Неизменяемая история создания и изменения оценок комиссии.
create table if not exists public.commission_score_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('insert', 'update')),
  old_score numeric(5,2),
  new_score numeric(5,2) not null,
  old_criteria_scores jsonb,
  new_criteria_scores jsonb not null,
  old_comment text,
  new_comment text,
  changed_at timestamptz not null default now()
);

alter table public.commission_score_history enable row level security;

drop policy if exists "Админ: читать историю оценок" on public.commission_score_history;
create policy "Админ: читать историю оценок"
  on public.commission_score_history for select
  using ((select public.is_admin()));

create or replace function public.log_commission_score_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.commission_score_history (
    application_id,
    reviewer_id,
    changed_by,
    operation,
    old_score,
    new_score,
    old_criteria_scores,
    new_criteria_scores,
    old_comment,
    new_comment
  )
  values (
    new.application_id,
    new.reviewer_id,
    (select auth.uid()),
    lower(tg_op),
    case when tg_op = 'UPDATE' then old.score else null end,
    new.score,
    case when tg_op = 'UPDATE' then old.criteria_scores else null end,
    new.criteria_scores,
    case when tg_op = 'UPDATE' then old.comment else null end,
    new.comment
  );
  return new;
end;
$$;

drop trigger if exists commission_scores_history on public.commission_scores;
create trigger commission_scores_history
  after insert or update of criteria_scores, score, comment
  on public.commission_scores
  for each row execute function public.log_commission_score_change();

create index if not exists commission_score_history_application_idx
  on public.commission_score_history(application_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- 5. История решений администратора
-- ---------------------------------------------------------------------------
alter table public.application_admin_history
  add column if not exists action_type text,
  add column if not exists comment text;

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
       or new.admin_action_type is distinct from old.admin_action_type
       or new.admin_status_comment is distinct from old.admin_status_comment
     )
  then
    insert into public.application_admin_history (
      application_id,
      changed_by,
      old_status,
      new_status,
      old_decision,
      new_decision,
      action_type,
      comment
    )
    values (
      new.id,
      (select auth.uid()),
      old.status,
      new.status,
      old.decision,
      new.decision,
      new.admin_action_type,
      new.admin_status_comment
    );
  end if;

  return new;
end;
$$;

drop trigger if exists applications_admin_history on public.applications;
create trigger applications_admin_history
  after update on public.applications
  for each row execute function public.log_admin_application_change();

-- ---------------------------------------------------------------------------
-- 6. Очередь Telegram + автоматическая подготовка событий
-- Сама отправка выполняется Edge Function telegram-notify.
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists application_id uuid references public.applications(id) on delete cascade,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists provider_message_id bigint;

alter table public.notifications
  drop constraint if exists notifications_status_check;

alter table public.notifications
  add constraint notifications_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled'));

create or replace function public.queue_application_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_event text;
begin
  if not (
    new.status is distinct from old.status
    or new.decision is distinct from old.decision
    or new.admin_status_comment is distinct from old.admin_status_comment
  ) then
    return new;
  end if;

  notification_event := case
    when new.decision is distinct from old.decision
      then 'competition_result'
    when new.status = 'needs_fixes'
      then 'application_revision'
    when new.status = 'rejected'
      then 'application_rejected'
    when new.status = 'evaluation'
      then 'application_sent_to_commission'
    when new.status = 'submitted' and old.status = 'needs_fixes'
      then 'application_resubmitted'
    when new.status = 'submitted'
      then 'application_submitted'
    else 'application_status'
  end;

  update public.notifications
  set
    status = 'cancelled',
    error_text = coalesce(error_text, 'Заменено более новым уведомлением по заявке')
  where application_id = new.id
    and channel = 'telegram'
    and event_type <> 'certificate_issued'
    and status in ('pending', 'failed');

  insert into public.notifications (
    user_id,
    application_id,
    channel,
    event_type,
    payload,
    status
  )
  values (
    new.user_id,
    new.id,
    'telegram',
    notification_event,
    jsonb_build_object(
      'application_id', new.id,
      'application_number', new.number,
      'old_status', old.status,
      'status', new.status,
      'decision', new.decision,
      'admin_action_type', new.admin_action_type,
      'admin_comment', new.admin_status_comment
    ),
    'pending'
  );

  return new;
end;
$$;

drop trigger if exists applications_notification_queue on public.applications;
create trigger applications_notification_queue
  after update on public.applications
  for each row execute function public.queue_application_notification();

create index if not exists notifications_application_idx
  on public.notifications(application_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Индексы
-- ---------------------------------------------------------------------------
create index if not exists applications_status_idx on public.applications(status);
create index if not exists commission_scores_application_idx
  on public.commission_scores(application_id);
