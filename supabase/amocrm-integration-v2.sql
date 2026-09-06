-- QazEducation -> amoCRM, безопасная синхронизация без дублей.
-- Выполнить один раз в Supabase SQL Editor.
--
-- Инвариант: одна public.applications.id соответствует максимум одной сделке
-- amoCRM. Повторные события только увеличивают desired_revision одной работы.

create table if not exists public.crm_sync_jobs (
  application_id uuid primary key references public.applications (id) on delete cascade,
  desired_revision bigint not null default 1,
  leased_revision bigint,
  processed_revision bigint not null default 0,
  state text not null default 'pending'
    check (state in ('pending', 'processing', 'synced', 'failed', 'disabled')),
  reason text not null default 'application_changed',
  amo_lead_id bigint,
  amo_contact_id bigint,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_expires_at timestamptz,
  create_attempted_at timestamptz,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_sync_jobs_amo_lead_unique
  on public.crm_sync_jobs (amo_lead_id)
  where amo_lead_id is not null;

create index if not exists crm_sync_jobs_pending_idx
  on public.crm_sync_jobs (state, next_attempt_at, updated_at);

create table if not exists public.crm_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_status_map (
  site_status text primary key,
  amo_status_id bigint not null,
  amo_status_name text not null,
  updated_at timestamptz not null default now()
);

alter table public.crm_sync_jobs enable row level security;
alter table public.crm_settings enable row level security;
alter table public.crm_status_map enable row level security;

-- Эти таблицы доступны только Edge Function через service_role.
revoke all on public.crm_sync_jobs from public, anon, authenticated;
revoke all on public.crm_settings from public, anon, authenticated;
revoke all on public.crm_status_map from public, anon, authenticated;
grant all on public.crm_sync_jobs to service_role;
grant all on public.crm_settings to service_role;
grant all on public.crm_status_map to service_role;

create or replace function public.crm_enqueue_application(
  p_application_id uuid,
  p_reason text default 'application_changed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crm_sync_jobs (
    application_id,
    desired_revision,
    state,
    reason,
    next_attempt_at,
    updated_at
  )
  values (
    p_application_id,
    1,
    'pending',
    left(coalesce(nullif(p_reason, ''), 'application_changed'), 100),
    now(),
    now()
  )
  on conflict (application_id) do update
  set
    desired_revision = public.crm_sync_jobs.desired_revision + 1,
    state = case
      when public.crm_sync_jobs.state = 'processing'
        and public.crm_sync_jobs.lease_expires_at > now()
      then 'processing'
      else 'pending'
    end,
    reason = excluded.reason,
    next_attempt_at = now(),
    last_error = null,
    updated_at = now();
end;
$$;

revoke all on function public.crm_enqueue_application(uuid, text)
  from public, anon, authenticated;
grant execute on function public.crm_enqueue_application(uuid, text)
  to service_role;

-- Участник может поставить в очередь только собственную заявку.
create or replace function public.crm_enqueue_own_application(
  p_reason text default 'client_sync'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  select a.id into app_id
  from public.applications a
  where a.user_id = auth.uid();

  if app_id is null then
    raise exception 'application_not_found';
  end if;

  perform public.crm_enqueue_application(app_id, p_reason);
  return app_id;
end;
$$;

revoke all on function public.crm_enqueue_own_application(text) from public, anon;
grant execute on function public.crm_enqueue_own_application(text) to authenticated;

-- Атомарная аренда не позволяет двум запросам одновременно создавать сделку.
create or replace function public.crm_claim_sync(
  p_application_id uuid,
  p_lease_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.crm_sync_jobs;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into job
  from public.crm_sync_jobs
  where application_id = p_application_id
  for update;

  if job.application_id is null then
    return jsonb_build_object('claimed', false, 'reason', 'not_queued');
  end if;

  if job.state = 'processing' and job.lease_expires_at > now() then
    return jsonb_build_object('claimed', false, 'reason', 'already_processing');
  end if;

  if job.next_attempt_at > now() then
    return jsonb_build_object('claimed', false, 'reason', 'retry_later');
  end if;

  update public.crm_sync_jobs
  set
    state = 'processing',
    leased_revision = desired_revision,
    lease_id = p_lease_id,
    lease_expires_at = now() + interval '90 seconds',
    attempts = attempts + 1,
    updated_at = now()
  where application_id = p_application_id;

  return jsonb_build_object(
    'claimed', true,
    'application_id', job.application_id,
    'revision', job.desired_revision,
    'amo_lead_id', job.amo_lead_id,
    'amo_contact_id', job.amo_contact_id,
    'create_attempted_at', job.create_attempted_at
  );
end;
$$;

create or replace function public.crm_mark_create_attempt(
  p_application_id uuid,
  p_lease_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.crm_sync_jobs
  set create_attempted_at = coalesce(create_attempted_at, now()), updated_at = now()
  where application_id = p_application_id and lease_id = p_lease_id;

  if not found then raise exception 'invalid_crm_lease'; end if;
end;
$$;

create or replace function public.crm_finish_sync(
  p_application_id uuid,
  p_lease_id uuid,
  p_amo_lead_id bigint,
  p_amo_contact_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_revision bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select leased_revision into target_revision
  from public.crm_sync_jobs
  where application_id = p_application_id and lease_id = p_lease_id
  for update;

  if target_revision is null then raise exception 'invalid_crm_lease'; end if;

  update public.crm_sync_jobs
  set
    amo_lead_id = coalesce(amo_lead_id, p_amo_lead_id),
    amo_contact_id = coalesce(amo_contact_id, p_amo_contact_id),
    processed_revision = target_revision,
    state = case when desired_revision > target_revision then 'pending' else 'synced' end,
    next_attempt_at = now(),
    lease_id = null,
    lease_expires_at = null,
    create_attempted_at = null,
    last_error = null,
    last_synced_at = now(),
    updated_at = now()
  where application_id = p_application_id and lease_id = p_lease_id;
end;
$$;

create or replace function public.crm_fail_sync(
  p_application_id uuid,
  p_lease_id uuid,
  p_error text,
  p_retry_seconds integer default 60
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.crm_sync_jobs
  set
    state = 'failed',
    next_attempt_at = now() + make_interval(secs => greatest(30, least(p_retry_seconds, 3600))),
    lease_id = null,
    lease_expires_at = null,
    last_error = left(coalesce(p_error, 'unknown_error'), 1000),
    updated_at = now()
  where application_id = p_application_id and lease_id = p_lease_id;

  if not found then raise exception 'invalid_crm_lease'; end if;
end;
$$;

revoke all on function public.crm_claim_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.crm_mark_create_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.crm_finish_sync(uuid, uuid, bigint, bigint) from public, anon, authenticated;
revoke all on function public.crm_fail_sync(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.crm_claim_sync(uuid, uuid) to service_role;
grant execute on function public.crm_mark_create_attempt(uuid, uuid) to service_role;
grant execute on function public.crm_finish_sync(uuid, uuid, bigint, bigint) to service_role;
grant execute on function public.crm_fail_sync(uuid, uuid, text, integer) to service_role;

create or replace function public.crm_queue_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare app_id uuid;
begin
  if nullif(trim(coalesce(new.first_name, '')), '') is null
     or nullif(trim(coalesce(new.last_name, '')), '') is null then
    return new;
  end if;

  select a.id into app_id from public.applications a where a.user_id = new.id;
  if app_id is not null then
    perform public.crm_enqueue_application(app_id, 'registration_or_profile_changed');
  end if;
  return new;
end;
$$;

drop trigger if exists crm_profiles_queue on public.profiles;
create trigger crm_profiles_queue
  after insert or update of first_name, last_name, phone, category
  on public.profiles
  for each row execute function public.crm_queue_profile_change();

create or replace function public.crm_queue_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare ready boolean;
begin
  select
    nullif(trim(coalesce(p.first_name, '')), '') is not null
    and nullif(trim(coalesce(p.last_name, '')), '') is not null
  into ready
  from public.profiles p
  where p.id = new.user_id;

  if coalesce(ready, false) then
    perform public.crm_enqueue_application(new.id, 'application_changed');
  end if;
  return new;
end;
$$;

drop trigger if exists crm_applications_queue on public.applications;
create trigger crm_applications_queue
  after insert or update of status, progress, data, decision, result_published_at
  on public.applications
  for each row execute function public.crm_queue_application_change();

create or replace function public.crm_queue_payment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare app_id uuid;
begin
  select a.id into app_id from public.applications a where a.user_id = new.user_id;
  if app_id is not null then
    perform public.crm_enqueue_application(app_id, 'payment_changed');
  end if;
  return new;
end;
$$;

drop trigger if exists crm_payments_queue on public.payments;
create trigger crm_payments_queue
  after insert or update of status, provider_payment_id, paid_at
  on public.payments
  for each row execute function public.crm_queue_payment_change();

-- Существующие зарегистрированные участники добавляются в очередь один раз.
insert into public.crm_sync_jobs (application_id, reason)
select a.id, 'migration_backfill'
from public.applications a
join public.profiles p on p.id = a.user_id
where nullif(trim(coalesce(p.first_name, '')), '') is not null
  and nullif(trim(coalesce(p.last_name, '')), '') is not null
on conflict (application_id) do nothing;
