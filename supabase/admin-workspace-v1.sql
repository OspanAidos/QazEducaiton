-- QazEducation — рабочая админ-панель, проверка документов и платёжный шлюз v1.
-- Выполнить ПОСЛЕ competition-results-v1.sql.
-- Миграция идемпотентна и не удаляет существующие заявки, документы или платежи.

-- ---------------------------------------------------------------------------
-- 1. Настройки оплаты конкурсного цикла
-- ---------------------------------------------------------------------------
alter table public.competition_cycles
  add column if not exists payment_required boolean not null default true,
  add column if not exists payment_available boolean not null default true,
  add column if not exists payment_provider text not null default 'apipay_qr';

update public.competition_cycles
set
  payment_required = true,
  payment_available = true,
  payment_provider = 'apipay_qr',
  updated_at = now()
where id = 2026;

-- Обычный авторизованный пользователь, включая администратора клиентской
-- панели, не может вручную подтвердить платёж. Это делает только webhook
-- ApiPay/Kaspi QR через service_role (или ответственный сотрудник в защищённом backend).
drop policy if exists "Админ: менять платежи" on public.payments;
revoke update on public.payments from authenticated;

create or replace function public.get_current_cycle_public_settings_v2(
  p_cycle_id integer default 2026
)
returns table (
  cycle_id integer,
  status text,
  applications_open_at timestamptz,
  applications_close_at timestamptz,
  allows_foreign_participants boolean,
  payment_required boolean,
  payment_available boolean,
  payment_provider text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.status,
    c.applications_open_at,
    c.applications_close_at,
    c.allows_foreign_participants,
    c.payment_required,
    c.payment_available,
    c.payment_provider
  from public.competition_cycles c
  where c.id = p_cycle_id;
$$;

revoke all on function public.get_current_cycle_public_settings_v2(integer) from public;
grant execute on function public.get_current_cycle_public_settings_v2(integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Проверка документов администратором
-- ---------------------------------------------------------------------------
create table if not exists public.application_document_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_id uuid not null references public.application_documents(id) on delete cascade,
  status text not null default 'pending',
  comment text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_document_reviews_unique unique (document_id),
  constraint application_document_reviews_status_check
    check (status in ('pending', 'accepted', 'replacement_required'))
);

create index if not exists application_document_reviews_application_idx
  on public.application_document_reviews(application_id, status);

drop trigger if exists application_document_reviews_touch_updated_at
  on public.application_document_reviews;
create trigger application_document_reviews_touch_updated_at
  before update on public.application_document_reviews
  for each row execute function public.touch_updated_at();

alter table public.application_document_reviews enable row level security;

drop policy if exists "Админ: читать проверку документов"
  on public.application_document_reviews;
create policy "Админ: читать проверку документов"
  on public.application_document_reviews for select
  using ((select public.is_admin()));

revoke insert, update, delete on public.application_document_reviews
  from authenticated;
grant select on public.application_document_reviews to authenticated;

create or replace function public.review_application_document(
  p_document_id uuid,
  p_status text,
  p_comment text default null
)
returns public.application_document_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_row public.application_documents;
  result public.application_document_reviews;
  normalized_comment text := nullif(trim(coalesce(p_comment, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  if p_status not in ('accepted', 'replacement_required') then
    raise exception 'Недопустимый результат проверки документа';
  end if;

  if p_status = 'replacement_required'
     and length(coalesce(normalized_comment, '')) < 5 then
    raise exception 'Укажите причину замены документа';
  end if;

  select * into document_row
  from public.application_documents
  where id = p_document_id;

  if document_row.id is null then
    raise exception 'Документ не найден';
  end if;

  insert into public.application_document_reviews (
    application_id,
    document_id,
    status,
    comment,
    reviewed_by,
    reviewed_at
  )
  values (
    document_row.application_id,
    document_row.id,
    p_status,
    normalized_comment,
    (select auth.uid()),
    now()
  )
  on conflict (document_id) do update
  set
    application_id = excluded.application_id,
    status = excluded.status,
    comment = excluded.comment,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.review_application_document(uuid, text, text)
  from public;
grant execute on function public.review_application_document(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Журнал статусов оплаты
-- ---------------------------------------------------------------------------
create table if not exists public.payment_status_history (
  id bigint generated by default as identity primary key,
  payment_id uuid not null references public.payments(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists payment_status_history_payment_idx
  on public.payment_status_history(payment_id, created_at desc);

alter table public.payment_status_history enable row level security;

drop policy if exists "Админ: читать историю платежей"
  on public.payment_status_history;
create policy "Админ: читать историю платежей"
  on public.payment_status_history for select
  using ((select public.is_admin()));

revoke insert, update, delete on public.payment_status_history from authenticated;
grant select on public.payment_status_history to authenticated;

create or replace function public.log_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.payment_status_history (
      payment_id,
      old_status,
      new_status,
      changed_by,
      reason
    )
    values (
      new.id,
      null,
      new.status,
      (select auth.uid()),
      nullif(new.metadata ->> 'status_reason', '')
    );
  elsif new.status is distinct from old.status then
    insert into public.payment_status_history (
      payment_id,
      old_status,
      new_status,
      changed_by,
      reason
    )
    values (
      new.id,
      old.status,
      new.status,
      (select auth.uid()),
      nullif(new.metadata ->> 'status_reason', '')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payments_status_history on public.payments;
create trigger payments_status_history
  after insert or update on public.payments
  for each row execute function public.log_payment_status_change();

-- ---------------------------------------------------------------------------
-- 4. Безопасная первичная/повторная отправка заявки
-- ---------------------------------------------------------------------------
create or replace function public.submit_own_application_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  payment_required_value boolean := true;
  payment_confirmed boolean := false;
  is_valid_resubmission boolean := false;
begin
  select * into app
  from public.applications a
  where a.user_id = (select auth.uid())
  for update;

  if app.id is null then
    raise exception 'Заявка не найдена';
  end if;

  if app.status not in ('draft', 'awaiting_payment', 'ready_to_submit', 'needs_fixes') then
    raise exception 'Заявка сейчас недоступна для отправки';
  end if;

  select coalesce(
    (
      select c.payment_required
      from public.competition_cycles c
      where c.id = 2026
    ),
    true
  ) into payment_required_value;

  select exists (
    select 1
    from public.payments p
    where p.user_id = (select auth.uid())
      and p.payment_type = 'competition_fee'
      and p.status = 'paid'
      and p.amount_tenge = 10000
  ) into payment_confirmed;

  is_valid_resubmission := app.status = 'needs_fixes' and app.submitted_at is not null;

  if payment_required_value and not payment_confirmed and not is_valid_resubmission then
    update public.applications
    set
      status = 'awaiting_payment',
      progress = greatest(progress, 95),
      updated_at = now()
    where id = app.id;

    return jsonb_build_object(
      'application_id', app.id,
      'application_number', app.number,
      'status', 'awaiting_payment',
      'payment_required', true,
      'submitted', false
    );
  end if;

  return public.submit_own_application();
end;
$$;

revoke all on function public.submit_own_application_v2() from public;
grant execute on function public.submit_own_application_v2() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Решения секретариата с серверными проверками
-- ---------------------------------------------------------------------------
create or replace function public.admin_transition_application(
  p_application_id uuid,
  p_action text,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  normalized_comment text := nullif(trim(coalesce(p_comment, '')), '');
  participant_birth date;
  participant_age integer;
  next_status text;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  if p_action not in ('commission', 'revision', 'reject') then
    raise exception 'Недопустимое действие';
  end if;

  if p_action in ('revision', 'reject')
     and length(coalesce(normalized_comment, '')) < 5 then
    raise exception 'Добавьте понятный комментарий';
  end if;

  select * into app
  from public.applications
  where id = p_application_id
  for update;

  if app.id is null then
    raise exception 'Заявка не найдена';
  end if;

  if app.status not in ('submitted', 'tech_review', 'accepted') then
    raise exception 'Для текущего статуса действие недоступно';
  end if;

  if p_action = 'commission' then
    if app.submitted_at is null then
      raise exception 'Заявка не была отправлена участником';
    end if;

    if not exists (
      select 1
      from public.payments p
      where p.user_id = app.user_id
        and p.payment_type = 'competition_fee'
        and p.status = 'paid'
        and p.amount_tenge = 10000
    ) then
      raise exception 'Оплата 10 000 ₸ не подтверждена';
    end if;

    if app.terms_accepted_at is null
       or coalesce((app.data ->> 'consent_data')::boolean, false) is not true
       or coalesce((app.data ->> 'consent_terms')::boolean, false) is not true then
      raise exception 'Согласия участника не зафиксированы полностью';
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.id = app.user_id
        and p.privacy_accepted_at is not null
        and p.terms_accepted_at is not null
    ) then
      raise exception 'Согласия при регистрации не зафиксированы сервером';
    end if;

    if nullif(trim(app.data ->> 'support_type'), '') is null then
      raise exception 'Не выбран вид поддержки';
    end if;

    begin
      participant_birth := (app.data ->> 'birth')::date;
    exception
      when others then
        raise exception 'Некорректная дата рождения';
    end;

    participant_age := date_part('year', age(app.submitted_at::date, participant_birth));

    if participant_age < 18 then
      if exists (
        select 1
        from (values
          ('birth_certificate'::text),
          ('guardian_identity'::text),
          ('guardian_consent'::text)
        ) as required(kind)
        where not exists (
          select 1
          from public.application_documents d
          join public.application_document_reviews r
            on r.document_id = d.id
           and r.status = 'accepted'
          where d.application_id = app.id
            and d.kind = required.kind
        )
      ) then
        raise exception 'Не все документы несовершеннолетнего проверены';
      end if;
    else
      if not exists (
        select 1
        from public.application_documents d
        join public.application_document_reviews r
          on r.document_id = d.id
         and r.status = 'accepted'
        where d.application_id = app.id
          and d.kind = 'identity'
      ) then
        raise exception 'Удостоверение личности не проверено';
      end if;
    end if;

    if not exists (
      select 1
      from public.application_documents d
      join public.application_document_reviews r
        on r.document_id = d.id
       and r.status = 'accepted'
      where d.application_id = app.id
        and d.kind in ('performance', 'academic_record')
    ) then
      raise exception 'Документ об успеваемости не проверен';
    end if;

    next_status := 'evaluation';
  elsif p_action = 'revision' then
    next_status := 'needs_fixes';
  else
    next_status := 'rejected';
  end if;

  update public.applications
  set
    status = next_status,
    admin_status_comment = normalized_comment,
    admin_action_type = p_action,
    admin_action_at = now(),
    revision_requested_at = case
      when p_action = 'revision' then now()
      else revision_requested_at
    end,
    rejected_at = case
      when p_action = 'reject' then now()
      else rejected_at
    end,
    updated_at = now()
  where id = app.id;

  return jsonb_build_object(
    'application_id', app.id,
    'status', next_status,
    'action', p_action,
    'changed_at', now()
  );
end;
$$;

revoke all on function public.admin_transition_application(uuid, text, text)
  from public;
grant execute on function public.admin_transition_application(uuid, text, text)
  to authenticated;
