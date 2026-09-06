-- QazEducation -> amoCRM: автоматическая обработка очереди раз в минуту.
-- Запускать после supabase/amocrm-integration-v2.sql.
--
-- Токен amoCRM остаётся только в Edge Function Secrets.
-- Cron получает отдельный случайный секрет из Supabase Vault.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if to_regclass('public.crm_sync_jobs') is null then
    raise exception 'Сначала выполните supabase/amocrm-integration-v2.sql';
  end if;
  if to_regclass('vault.secrets') is null then
    raise exception 'Supabase Vault недоступен в этом проекте';
  end if;
end;
$$;

create table if not exists public.crm_worker_state (
  singleton boolean primary key default true check (singleton),
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_status text,
  last_processed integer not null default 0,
  last_failed integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.crm_worker_state enable row level security;
revoke all on public.crm_worker_state from public, anon, authenticated;
grant all on public.crm_worker_state to service_role;

insert into public.crm_worker_state (singleton)
values (true)
on conflict (singleton) do nothing;

-- Создаём отдельный секрет фонового обработчика. Его значение не выводится
-- в SQL Editor и не хранится в исходном коде.
do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'qazeducation_amocrm_worker_secret'
  ) then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'qazeducation_amocrm_worker_secret',
      'Internal authentication for the QazEducation amoCRM queue worker'
    );
  end if;
end;
$$;

create or replace function public.crm_authorize_worker(p_secret text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return false;
  end if;

  select decrypted_secret into expected_secret
  from vault.decrypted_secrets
  where name = 'qazeducation_amocrm_worker_secret';

  return coalesce(length(p_secret) >= 32 and p_secret = expected_secret, false);
end;
$$;

revoke all on function public.crm_authorize_worker(text) from public, anon, authenticated;
grant execute on function public.crm_authorize_worker(text) to service_role;

-- Обновляем аренду очереди: Edge Function получает номер текущей попытки и
-- применяет возрастающую задержку при повторных ошибках.
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
    'attempts', job.attempts + 1,
    'amo_lead_id', job.amo_lead_id,
    'amo_contact_id', job.amo_contact_id,
    'create_attempted_at', job.create_attempted_at
  );
end;
$$;

revoke all on function public.crm_claim_sync(uuid, uuid) from public, anon, authenticated;
grant execute on function public.crm_claim_sync(uuid, uuid) to service_role;

create or replace function public.crm_auto_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id bigint;
  job_active boolean;
  job_schedule text;
  worker public.crm_worker_state;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select jobid, active, schedule
    into job_id, job_active, job_schedule
  from cron.job
  where jobname = 'qazeducation-amocrm-auto-sync'
  limit 1;

  select * into worker
  from public.crm_worker_state
  where singleton = true;

  return jsonb_build_object(
    'installed', job_id is not null,
    'active', coalesce(job_active, false),
    'schedule', job_schedule,
    'last_run_at', coalesce(worker.last_finished_at, worker.last_started_at),
    'last_success_at', worker.last_success_at,
    'last_status', worker.last_status,
    'last_processed', coalesce(worker.last_processed, 0),
    'last_failed', coalesce(worker.last_failed, 0),
    'last_error', worker.last_error
  );
end;
$$;

revoke all on function public.crm_auto_sync_status() from public, anon, authenticated;
grant execute on function public.crm_auto_sync_status() to service_role;

-- Вызывается один раз из SQL Editor. Publishable key не является секретным,
-- но сохраняется в Vault, чтобы он не дублировался в тексте задания Cron.
create or replace function public.crm_install_auto_sync(p_publishable_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  publishable_secret_id uuid;
  worker_secret_exists boolean;
  job_id bigint;
begin
  if length(trim(coalesce(p_publishable_key, ''))) < 20 then
    raise exception 'Укажите действующий Supabase publishable/anon key';
  end if;

  select id into publishable_secret_id
  from vault.secrets
  where name = 'qazeducation_publishable_key';

  if publishable_secret_id is null then
    perform vault.create_secret(
      trim(p_publishable_key),
      'qazeducation_publishable_key',
      'Public API key used only to invoke the QazEducation amoCRM Edge Function from Cron'
    );
  else
    perform vault.update_secret(
      publishable_secret_id,
      trim(p_publishable_key),
      'qazeducation_publishable_key',
      'Public API key used only to invoke the QazEducation amoCRM Edge Function from Cron'
    );
  end if;

  select exists (
    select 1 from vault.secrets where name = 'qazeducation_amocrm_worker_secret'
  ) into worker_secret_exists;
  if not worker_secret_exists then
    raise exception 'Не создан внутренний секрет amoCRM worker';
  end if;

  -- Повторный запуск установщика заменяет прежнюю задачу, а не создаёт дубль.
  select jobid into job_id
  from cron.job
  where jobname = 'qazeducation-amocrm-auto-sync'
  limit 1;

  if job_id is not null then
    perform cron.unschedule(job_id);
    job_id := null;
  end if;

  select cron.schedule(
    'qazeducation-amocrm-auto-sync',
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://fdoduxdwkgnldrzzxovu.supabase.co/functions/v1/amocrm-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'qazeducation_publishable_key'
          ),
          'x-amocrm-worker-secret', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'qazeducation_amocrm_worker_secret'
          )
        ),
        body := jsonb_build_object('action', 'worker'),
        timeout_milliseconds := 55000
      ) as request_id;
    $cron$
  ) into job_id;

  return jsonb_build_object(
    'installed', true,
    'job_id', job_id,
    'job_name', 'qazeducation-amocrm-auto-sync',
    'schedule', '* * * * *'
  );
end;
$$;

revoke all on function public.crm_install_auto_sync(text)
  from public, anon, authenticated, service_role;

comment on function public.crm_install_auto_sync(text) is
  'Run once from Supabase SQL Editor to install the automatic amoCRM queue worker.';
