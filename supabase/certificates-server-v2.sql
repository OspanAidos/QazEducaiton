-- QazEducation - автоматические сертификаты v2 с серверной генерацией файлов.
-- Выполнить ПОСЛЕ catalog-qr-v3.sql, telegram-notifications.sql
-- и competition-results-v1.sql.
-- Миграция не удаляет заявки, платежи, документы или результаты.

begin;

-- Закрытое хранилище для печати, подписи, шрифтов и готовых файлов.
-- Для этого bucket намеренно не создаются клиентские Storage policies:
-- читать и записывать его может только Edge Function с service_role.
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'qazeducation-certificates-private',
  'qazeducation-certificates-private',
  false,
  15728640
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit;

-- ---------------------------------------------------------------------------
-- 1. Основание итоговых сертификатов
-- ---------------------------------------------------------------------------
alter table public.competition_cycles
  add column if not exists certificate_basis_document text,
  add column if not exists certificate_basis_number text,
  add column if not exists certificate_basis_date date;

create or replace function public.set_competition_certificate_basis(
  p_cycle_id integer,
  p_document text,
  p_number text,
  p_date date
)
returns public.competition_cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.competition_cycles;
  clean_document text := nullif(trim(coalesce(p_document, '')), '');
  clean_number text := nullif(trim(coalesce(p_number, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  if clean_document is not null and char_length(clean_document) > 120 then
    raise exception 'Название документа слишком длинное';
  end if;

  if clean_number is not null and char_length(clean_number) > 60 then
    raise exception 'Номер документа слишком длинный';
  end if;

  update public.competition_cycles
  set
    certificate_basis_document = clean_document,
    certificate_basis_number = clean_number,
    certificate_basis_date = p_date,
    updated_at = now()
  where id = p_cycle_id
  returning * into result;

  if result.id is null then
    raise exception 'Конкурсный цикл не найден';
  end if;

  return result;
end;
$$;

revoke all on function public.set_competition_certificate_basis(integer, text, text, date)
  from public, anon;
grant execute on function public.set_competition_certificate_basis(integer, text, text, date)
  to authenticated;

-- Уведомление о выданном сертификате не должно отменяться при следующем
-- изменении статуса заявки. Эта версия заменяет функцию из старой миграции.
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
    when new.decision is distinct from old.decision then 'competition_result'
    when new.status = 'needs_fixes' then 'application_revision'
    when new.status = 'rejected' then 'application_rejected'
    when new.status = 'evaluation' then 'application_sent_to_commission'
    when new.status = 'submitted' and old.status = 'needs_fixes'
      then 'application_resubmitted'
    when new.status = 'submitted' then 'application_submitted'
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
    user_id, application_id, channel, event_type, payload, status
  ) values (
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

-- ---------------------------------------------------------------------------
-- 2. Реестр сертификатов
-- ---------------------------------------------------------------------------
create table if not exists public.certificate_counters (
  certificate_year integer not null,
  certificate_type text not null,
  last_value bigint not null default 0,
  primary key (certificate_year, certificate_type),
  constraint certificate_counters_type_check
    check (certificate_type in ('participant', 'grant', 'scholarship', 'top30'))
);

alter table public.certificate_counters enable row level security;
revoke all on public.certificate_counters from anon, authenticated;

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  certificate_type text not null,
  certificate_number text not null unique,
  verification_token uuid not null default gen_random_uuid() unique,
  recipient_first_name text not null,
  recipient_last_name text not null,
  basis_text text,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revocation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificates_type_check
    check (certificate_type in ('participant', 'grant', 'scholarship', 'top30')),
  constraint certificates_status_check
    check (status in ('active', 'revoked')),
  constraint certificates_names_check
    check (
      char_length(trim(recipient_first_name)) between 2 and 80
      and char_length(trim(recipient_last_name)) between 2 and 80
    )
);

create unique index if not exists certificates_one_active_type_idx
  on public.certificates(application_id, certificate_type)
  where status = 'active';

create index if not exists certificates_user_issued_idx
  on public.certificates(user_id, issued_at desc);

create index if not exists certificates_verification_idx
  on public.certificates(verification_token);

drop trigger if exists certificates_touch_updated_at on public.certificates;
create trigger certificates_touch_updated_at
  before update on public.certificates
  for each row execute function public.touch_updated_at();

alter table public.certificates enable row level security;

drop policy if exists "Сертификаты: читать свои" on public.certificates;
create policy "Сертификаты: читать свои"
  on public.certificates for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Админ: читать сертификаты" on public.certificates;
create policy "Админ: читать сертификаты"
  on public.certificates for select
  using ((select public.is_admin()));

revoke insert, update, delete on public.certificates from anon, authenticated;
grant select on public.certificates to authenticated;

create table if not exists public.certificate_issue_errors (
  id bigint generated by default as identity primary key,
  application_id uuid references public.applications(id) on delete cascade,
  certificate_type text,
  error_text text not null,
  created_at timestamptz not null default now()
);

alter table public.certificate_issue_errors enable row level security;
drop policy if exists "Админ: читать ошибки сертификатов" on public.certificate_issue_errors;
create policy "Админ: читать ошибки сертификатов"
  on public.certificate_issue_errors for select
  using ((select public.is_admin()));
revoke insert, update, delete on public.certificate_issue_errors from anon, authenticated;
grant select on public.certificate_issue_errors to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Номера, основание и безопасная серверная выдача
-- ---------------------------------------------------------------------------
create or replace function public.qz_next_certificate_number(
  p_type text,
  p_year integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number bigint;
  type_code text;
begin
  if p_type not in ('participant', 'grant', 'scholarship', 'top30') then
    raise exception 'Недопустимый тип сертификата';
  end if;

  insert into public.certificate_counters (
    certificate_year,
    certificate_type,
    last_value
  )
  values (p_year, p_type, 1)
  on conflict (certificate_year, certificate_type) do update
  set last_value = public.certificate_counters.last_value + 1
  returning last_value into next_number;

  type_code := case p_type
    when 'participant' then 'P'
    when 'grant' then 'G'
    when 'scholarship' then 'S'
    when 'top30' then 'F'
  end;

  return 'QE-' || p_year::text || '-' || type_code || '-' ||
    lpad(next_number::text, 6, '0');
end;
$$;

revoke all on function public.qz_next_certificate_number(text, integer)
  from public, anon, authenticated;

create or replace function public.qz_certificate_basis(
  p_application public.applications
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cycle public.competition_cycles;
  publication_date date;
begin
  select * into cycle
  from public.competition_cycles c
  where c.id = extract(year from coalesce(
    p_application.result_published_at,
    p_application.submitted_at,
    now()
  ) at time zone 'Asia/Almaty')::integer;

  publication_date := coalesce(
    cycle.certificate_basis_date,
    (p_application.result_published_at at time zone 'Asia/Almaty')::date,
    current_date
  );

  if nullif(trim(cycle.certificate_basis_document), '') is not null
     and nullif(trim(cycle.certificate_basis_number), '') is not null then
    return trim(cycle.certificate_basis_document) || ' №' ||
      trim(cycle.certificate_basis_number) || ' от ' ||
      to_char(publication_date, 'DD.MM.YYYY');
  end if;

  return 'Решение конкурсной комиссии от ' ||
    to_char(publication_date, 'DD.MM.YYYY');
end;
$$;

revoke all on function public.qz_certificate_basis(public.applications)
  from public, anon, authenticated;

create or replace function public.qz_issue_certificate(
  p_application_id uuid,
  p_certificate_type text,
  p_basis_text text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  participant public.profiles;
  issued_certificate public.certificates;
  existing_id uuid;
  issue_time timestamptz;
  issue_year integer;
  expected_decision text;
  final_basis text;
begin
  if p_certificate_type not in ('participant', 'grant', 'scholarship', 'top30') then
    return null;
  end if;

  select * into app
  from public.applications a
  where a.id = p_application_id;

  if app.id is null then
    return null;
  end if;

  select * into participant
  from public.profiles p
  where p.id = app.user_id;

  if nullif(trim(participant.first_name), '') is null
     or nullif(trim(participant.last_name), '') is null then
    raise exception 'В профиле отсутствуют имя или фамилия';
  end if;

  if p_certificate_type = 'participant' then
    if app.submitted_at is null
       or not public.qz_has_competition_access(app.user_id) then
      return null;
    end if;
    issue_time := app.submitted_at;
    final_basis := null;
  else
    expected_decision := case p_certificate_type
      when 'grant' then 'grant'
      when 'scholarship' then 'scholarship'
      when 'top30' then 'top30'
    end;

    if app.status <> 'result'
       or app.result_published_at is null
       or app.decision is distinct from expected_decision then
      return null;
    end if;

    issue_time := app.result_published_at;
    final_basis := coalesce(
      nullif(trim(coalesce(p_basis_text, '')), ''),
      public.qz_certificate_basis(app)
    );
  end if;

  select c.id into existing_id
  from public.certificates c
  where c.application_id = app.id
    and c.certificate_type = p_certificate_type
    and c.status = 'active'
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  issue_year := extract(year from issue_time at time zone 'Asia/Almaty')::integer;

  insert into public.certificates (
    user_id,
    application_id,
    certificate_type,
    certificate_number,
    recipient_first_name,
    recipient_last_name,
    basis_text,
    issued_at,
    metadata
  )
  values (
    app.user_id,
    app.id,
    p_certificate_type,
    public.qz_next_certificate_number(p_certificate_type, issue_year),
    trim(participant.first_name),
    trim(participant.last_name),
    final_basis,
    issue_time,
    jsonb_build_object(
      'application_number', app.number,
      'decision', app.decision,
      'support_type', app.data ->> 'support_type',
      'university', nullif(trim(app.data ->> 'university'), ''),
      'specialty', nullif(trim(app.data ->> 'specialty'), ''),
      'scholarship_amount_tenge', case
        when p_certificate_type = 'scholarship' then 50000
        else null
      end,
      'cycle_id', issue_year,
      'template_version', '2026-v2-server',
      'organization', 'ТОО «Business International Group Partners»',
      'signer_name', 'Жунусов Нуржан Кожабекович',
      'signer_role', 'Руководитель'
    )
  )
  returning * into issued_certificate;

  insert into public.notifications (
    user_id,
    application_id,
    channel,
    event_type,
    payload,
    status
  )
  values (
    app.user_id,
    app.id,
    'telegram',
    'certificate_issued',
    jsonb_build_object(
      'application_id', app.id,
      'application_number', app.number,
      'certificate_id', issued_certificate.id,
      'certificate_type', issued_certificate.certificate_type,
      'certificate_number', issued_certificate.certificate_number,
      'verification_token', issued_certificate.verification_token
    ),
    'pending'
  );

  return issued_certificate.id;
end;
$$;

revoke all on function public.qz_issue_certificate(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.qz_issue_certificate(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Автоматическая выдача и отзыв при изменении результатов
-- ---------------------------------------------------------------------------
create or replace function public.qz_sync_application_certificates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  desired_result_type text;
begin
  begin
    if new.submitted_at is not null then
      perform public.qz_issue_certificate(new.id, 'participant', null);
    end if;
  exception when others then
    insert into public.certificate_issue_errors (
      application_id,
      certificate_type,
      error_text
    ) values (new.id, 'participant', left(sqlerrm, 1000));
  end;

  desired_result_type := case
    when new.status = 'result' and new.decision = 'grant' then 'grant'
    when new.status = 'result' and new.decision = 'scholarship' then 'scholarship'
    when new.status = 'result' and new.decision = 'top30' then 'top30'
    else null
  end;

  update public.certificates
  set
    status = 'revoked',
    revoked_at = now(),
    revocation_reason = case
      when desired_result_type is null then 'Результат заявки изменён или отменён'
      else 'Изменён вид итогового решения'
    end
  where application_id = new.id
    and certificate_type in ('grant', 'scholarship', 'top30')
    and status = 'active'
    and certificate_type is distinct from desired_result_type;

  if desired_result_type is not null then
    begin
      perform public.qz_issue_certificate(new.id, desired_result_type, null);
    exception when others then
      insert into public.certificate_issue_errors (
        application_id,
        certificate_type,
        error_text
      ) values (new.id, desired_result_type, left(sqlerrm, 1000));
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists applications_certificate_sync on public.applications;
drop trigger if exists zz_applications_certificate_sync on public.applications;
create trigger zz_applications_certificate_sync
  after insert or update on public.applications
  for each row execute function public.qz_sync_application_certificates();

-- ---------------------------------------------------------------------------
-- 5. Проверка подлинности по QR без раскрытия заявки и контактов
-- ---------------------------------------------------------------------------
create or replace function public.verify_certificate(
  p_token uuid
)
returns table (
  valid boolean,
  certificate_status text,
  certificate_type text,
  certificate_number text,
  recipient_first_name text,
  recipient_last_name text,
  basis_text text,
  issued_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select
    c.status = 'active',
    c.status,
    c.certificate_type,
    c.certificate_number,
    c.recipient_first_name,
    c.recipient_last_name,
    c.basis_text,
    c.issued_at
  from public.certificates c
  where c.verification_token = p_token;

  if not found then
    return query
    select
      false,
      'not_found'::text,
      null::text,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz;
  end if;
end;
$$;

revoke all on function public.verify_certificate(uuid) from public;
grant execute on function public.verify_certificate(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Управление и безопасный повторный запуск выдачи
-- ---------------------------------------------------------------------------
-- Helper called by admin backfill without manufacturing trigger records.
create or replace function public.qz_sync_application_certificates_for_id(
  p_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  result_type text;
begin
  select * into app from public.applications where id = p_application_id;
  if app.id is null then return; end if;

  if app.submitted_at is not null then
    perform public.qz_issue_certificate(app.id, 'participant', null);
  end if;

  result_type := case
    when app.status = 'result' and app.decision = 'grant' then 'grant'
    when app.status = 'result' and app.decision = 'scholarship' then 'scholarship'
    when app.status = 'result' and app.decision = 'top30' then 'top30'
    else null
  end;

  if result_type is not null then
    perform public.qz_issue_certificate(app.id, result_type, null);
  end if;
end;
$$;

revoke all on function public.qz_sync_application_certificates_for_id(uuid)
  from public, anon, authenticated;
grant execute on function public.qz_sync_application_certificates_for_id(uuid)
  to service_role;

create or replace function public.admin_sync_certificates(
  p_cycle_id integer default 2026
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  scanned_count integer := 0;
  before_count bigint;
  after_count bigint;
  error_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  for app in
    select a.*
    from public.applications a
    where extract(year from coalesce(a.submitted_at, a.created_at)
      at time zone 'Asia/Almaty')::integer = p_cycle_id
    order by a.created_at
  loop
    scanned_count := scanned_count + 1;
    begin
      perform public.qz_sync_application_certificates_for_id(app.id);
    exception when others then
      error_count := error_count + 1;
      insert into public.certificate_issue_errors (
        application_id,
        certificate_type,
        error_text
      ) values (app.id, 'sync', left(sqlerrm, 1000));
    end;
  end loop;

  select count(*) into after_count
  from public.certificates c
  join public.applications a on a.id = c.application_id
  where c.status = 'active'
    and extract(year from coalesce(a.submitted_at, a.created_at)
      at time zone 'Asia/Almaty')::integer = p_cycle_id;

  select count(*) into before_count
  from public.certificates c
  join public.applications a on a.id = c.application_id
  where c.status = 'active'
    and c.created_at < transaction_timestamp()
    and extract(year from coalesce(a.submitted_at, a.created_at)
      at time zone 'Asia/Almaty')::integer = p_cycle_id;

  return jsonb_build_object(
    'ok', true,
    'applications_scanned', scanned_count,
    'issued_now', greatest(after_count - before_count, 0),
    'active_certificates', after_count,
    'errors', error_count
  );
end;
$$;

revoke all on function public.admin_sync_certificates(integer)
  from public, anon;
grant execute on function public.admin_sync_certificates(integer)
  to authenticated;

commit;
