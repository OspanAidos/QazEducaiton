-- QazEducation — апелляции v1.
-- Выполнить после workflow-v5.sql и admin-panel.sql.

alter table public.applications
  add column if not exists appeal_deadline timestamptz;

create or replace function public.add_working_days(
  p_start timestamptz,
  p_days integer
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  result timestamptz := p_start;
  added integer := 0;
begin
  while added < greatest(p_days, 0) loop
    result := result + interval '1 day';
    if extract(isodow from result at time zone 'Asia/Almaty') between 1 and 5 then
      added := added + 1;
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.set_rejection_appeal_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'rejected' and old.status is distinct from new.status then
    new.appeal_deadline := public.add_working_days(now(), 3);
  end if;
  return new;
end;
$$;

drop trigger if exists applications_rejection_appeal_deadline on public.applications;
create trigger applications_rejection_appeal_deadline
  before update of status on public.applications
  for each row execute function public.set_rejection_appeal_deadline();

create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 50 and 4000),
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'satisfied', 'rejected')),
  response text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appeals enable row level security;

drop policy if exists "Апелляции: читать свою" on public.appeals;
create policy "Апелляции: читать свою"
  on public.appeals for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Админ: читать апелляции" on public.appeals;
create policy "Админ: читать апелляции"
  on public.appeals for select
  using ((select public.is_admin()));

drop trigger if exists appeals_touch_updated_at on public.appeals;
create trigger appeals_touch_updated_at
  before update on public.appeals
  for each row execute function public.touch_updated_at();

create or replace function public.submit_own_appeal(p_reason text)
returns public.appeals
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  result public.appeals;
begin
  select * into app
  from public.applications a
  where a.user_id = (select auth.uid())
  for update;

  if app.id is null then
    raise exception 'Заявка не найдена';
  end if;

  if app.status not in ('result', 'rejected') then
    raise exception 'Для текущего статуса апелляция недоступна';
  end if;

  if app.appeal_deadline is null or app.appeal_deadline <= now() then
    raise exception 'Срок подачи апелляции истёк';
  end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 50 and 4000 then
    raise exception 'Основание апелляции должно содержать от 50 до 4000 символов';
  end if;

  insert into public.appeals (application_id, user_id, reason)
  values (app.id, (select auth.uid()), trim(p_reason))
  returning * into result;

  update public.applications
  set status = 'appeal', deadline = null
  where id = app.id;

  return result;
end;
$$;

revoke all on function public.submit_own_appeal(text) from public;
grant execute on function public.submit_own_appeal(text) to authenticated;

create or replace function public.resolve_appeal(
  p_appeal_id uuid,
  p_status text,
  p_response text
)
returns public.appeals
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.appeals;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  if p_status not in ('under_review', 'satisfied', 'rejected') then
    raise exception 'Недопустимый статус апелляции';
  end if;

  if p_status in ('satisfied', 'rejected')
     and nullif(trim(coalesce(p_response, '')), '') is null then
    raise exception 'Укажите мотивированный ответ';
  end if;

  update public.appeals
  set
    status = p_status,
    response = nullif(trim(coalesce(p_response, '')), ''),
    reviewed_by = (select auth.uid()),
    resolved_at = case when p_status in ('satisfied', 'rejected') then now() else null end,
    updated_at = now()
  where id = p_appeal_id
  returning * into item;

  if item.id is null then
    raise exception 'Апелляция не найдена';
  end if;

  if p_status = 'satisfied' then
    update public.applications
    set
      status = 'evaluation',
      decision = null,
      result_published_at = null,
      appeal_deadline = null,
      admin_status_comment = 'Апелляция удовлетворена. Заявка возвращена комиссии на пересмотр.',
      admin_action_type = 'appeal_satisfied',
      admin_action_at = now()
    where id = item.application_id;
  elsif p_status = 'rejected' then
    update public.applications a
    set
      status = case when a.decision is null then 'rejected' else 'result' end,
      appeal_deadline = null,
      admin_status_comment = trim(p_response),
      admin_action_type = 'appeal_rejected',
      admin_action_at = now()
    where a.id = item.application_id;
  end if;

  return item;
end;
$$;

revoke all on function public.resolve_appeal(uuid, text, text) from public;
grant execute on function public.resolve_appeal(uuid, text, text) to authenticated;

create index if not exists appeals_status_idx on public.appeals(status, submitted_at);
