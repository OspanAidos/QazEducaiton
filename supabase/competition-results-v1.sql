-- QazEducation — завершение конкурса и публикация итогов v1
-- Выполнить ПОСЛЕ workflow-v5.sql и telegram-notifications.sql.
-- Миграция идемпотентна: повторный запуск безопасен.

-- ---------------------------------------------------------------------------
-- 1. Состояние конкурсного цикла
-- ---------------------------------------------------------------------------
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
create table if not exists public.competition_cycles (
  id integer primary key,
  status text not null default 'open',
  grant_quota integer not null default 10,
  scholarship_quota integer not null default 30,
  top30_quota integer not null default 30,
  applications_open_at timestamptz not null default '2026-08-10 00:00:00+05',
  applications_close_at timestamptz not null default '2026-09-30 23:59:59+05',
  allows_foreign_participants boolean not null default false,
  applications_closed_at timestamptz,
  results_published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_cycles_status_check
    check (status in ('open', 'applications_closed', 'results_published')),
  constraint competition_cycles_quotas_check
    check (grant_quota >= 0 and scholarship_quota >= 0 and top30_quota >= 0)
);

alter table public.competition_cycles
  add column if not exists applications_open_at timestamptz not null default '2026-08-10 00:00:00+05',
  add column if not exists applications_close_at timestamptz not null default '2026-09-30 23:59:59+05',
  add column if not exists allows_foreign_participants boolean not null default false;

insert into public.competition_cycles (
  id,
  status,
  grant_quota,
  scholarship_quota,
  top30_quota,
  applications_open_at,
  applications_close_at
)
values (2026, 'open', 10, 30, 30, '2026-08-10 00:00:00+05', '2026-09-30 23:59:59+05')
on conflict (id) do nothing;

update public.competition_cycles
set scholarship_quota = 30,
    applications_open_at = '2026-08-10 00:00:00+05',
    applications_close_at = '2026-09-30 23:59:59+05',
    updated_at = now()
where id = 2026
  and status <> 'results_published';

alter table public.competition_cycles enable row level security;

drop policy if exists "Админ: читать конкурсный цикл" on public.competition_cycles;
create policy "Админ: читать конкурсный цикл"
  on public.competition_cycles for select
  using ((select public.is_admin()));

-- Изменение состояния делаем только RPC-функциями ниже.
revoke insert, update, delete on public.competition_cycles from authenticated;
grant select on public.competition_cycles to authenticated;

create or replace function public.get_current_cycle_public_settings(
  p_cycle_id integer default 2026
)
returns table (
  cycle_id integer,
  status text,
  applications_open_at timestamptz,
  applications_close_at timestamptz,
  allows_foreign_participants boolean
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
    c.allows_foreign_participants
  from public.competition_cycles c
  where c.id = p_cycle_id;
$$;

revoke all on function public.get_current_cycle_public_settings(integer) from public;
grant execute on function public.get_current_cycle_public_settings(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Закрытие / повторное открытие приёма заявок
-- ---------------------------------------------------------------------------
create or replace function public.close_competition_intake(
  p_cycle_id integer default 2026
)
returns public.competition_cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.competition_cycles;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  update public.competition_cycles
  set
    status = case
      when status = 'results_published' then status
      else 'applications_closed'
    end,
    applications_closed_at = case
      when status = 'open' then now()
      else applications_closed_at
    end,
    updated_at = now()
  where id = p_cycle_id
  returning * into result;

  if result.id is null then
    raise exception 'Конкурсный цикл % не найден', p_cycle_id;
  end if;

  if result.status = 'results_published' then
    raise exception 'Итоги уже опубликованы';
  end if;

  return result;
end;
$$;

revoke all on function public.close_competition_intake(integer) from public;
grant execute on function public.close_competition_intake(integer) to authenticated;

create or replace function public.reopen_competition_intake(
  p_cycle_id integer default 2026
)
returns public.competition_cycles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.competition_cycles;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  update public.competition_cycles
  set
    status = 'open',
    applications_closed_at = null,
    updated_at = now()
  where id = p_cycle_id
    and status <> 'results_published'
  returning * into result;

  if result.id is null then
    raise exception 'Нельзя повторно открыть приём: цикл не найден или итоги уже опубликованы';
  end if;

  return result;
end;
$$;

revoke all on function public.reopen_competition_intake(integer) from public;
grant execute on function public.reopen_competition_intake(integer) to authenticated;

-- После закрытия приёма запрещаем НОВУЮ финальную подачу заявки.
-- Повторную отправку заявки со статуса needs_fixes оставляем доступной до публикации итогов.
create or replace function public.guard_competition_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cycle_status text;
  cycle_opens_at timestamptz;
  cycle_closes_at timestamptz;
begin
  select c.status, c.applications_open_at, c.applications_close_at
    into cycle_status, cycle_opens_at, cycle_closes_at
  from public.competition_cycles c
  where c.id = 2026;

  cycle_status := coalesce(cycle_status, 'open');

  if cycle_status = 'results_published'
     and not public.is_admin()
     and (
       new.status is distinct from old.status
       or new.data is distinct from old.data
     ) then
    raise exception 'Конкурс завершён. Изменение заявки недоступно';
  end if;

  if new.status = 'submitted'
     and new.status is distinct from old.status
     and old.status <> 'needs_fixes'
     and cycle_status <> 'open'
     and not public.is_admin() then
    raise exception 'Приём заявок завершён';
  end if;

  if new.status = 'submitted'
     and new.status is distinct from old.status
     and old.status <> 'needs_fixes'
     and (now() < cycle_opens_at or now() > cycle_closes_at)
     and not public.is_admin() then
    raise exception 'Заявки принимаются с 10 августа по 30 сентября 2026 года включительно';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_competition_submission_guard on public.applications;
create trigger applications_competition_submission_guard
  before update on public.applications
  for each row execute function public.guard_competition_submission();

-- ---------------------------------------------------------------------------
-- 3. Серверный предварительный рейтинг
-- ---------------------------------------------------------------------------
create or replace function public.get_competition_results_preview(
  p_cycle_id integer default 2026
)
returns table (
  application_id uuid,
  application_number text,
  support_type text,
  average_score numeric,
  score_count bigint,
  active_experts bigint,
  suggested_decision text,
  rank_position integer,
  boundary_tie boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  grant_limit integer;
  scholarship_limit integer;
  top30_limit integer;
  experts_count bigint;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  select c.grant_quota, c.scholarship_quota, c.top30_quota
    into grant_limit, scholarship_limit, top30_limit
  from public.competition_cycles c
  where c.id = p_cycle_id;

  if grant_limit is null then
    raise exception 'Конкурсный цикл % не найден', p_cycle_id;
  end if;

  select count(*)::bigint
    into experts_count
  from public.commission_members cm
  where cm.active = true;

  if experts_count = 0 then
    return;
  end if;

  return query
  with scored as (
    select
      a.id,
      a.number::text as number,
      nullif(a.data ->> 'support_type', '') as support_type,
      round(avg(cs.score)::numeric, 2) as average_score,
      round(avg(
        case
          when (cs.criteria_scores ->> 'motivation') ~ '^[0-9]+([.][0-9]+)?$'
            then (cs.criteria_scores ->> 'motivation')::numeric
          else null
        end
      )::numeric, 2) as motivation_score,
      round(avg(
        case
          when (cs.criteria_scores ->> 'social_need') ~ '^[0-9]+([.][0-9]+)?$'
            then (cs.criteria_scores ->> 'social_need')::numeric
          else null
        end
      )::numeric, 2) as social_need_score,
      count(distinct cs.reviewer_id)::bigint as score_count
    from public.applications a
    join public.commission_scores cs
      on cs.application_id = a.id
    join public.commission_members cm
      on cm.user_id = cs.reviewer_id
     and cm.active = true
    where a.status in ('evaluation', 'final', 'result')
      and nullif(a.data ->> 'support_type', '') in ('grant', 'scholarship')
    group by a.id, a.number, a.data
    having count(distinct cs.reviewer_id) = experts_count
  ),
  grant_rank as (
    select
      s.*,
      row_number() over (
        order by s.average_score desc, s.motivation_score desc, s.number asc, s.id asc
      )::integer as rn
    from scored s
    where s.support_type = 'grant'
  ),
  scholarship_rank as (
    select
      s.*,
      row_number() over (
        order by s.average_score desc, s.social_need_score desc, s.number asc, s.id asc
      )::integer as rn
    from scored s
    where s.support_type = 'scholarship'
  ),
  primary_winners as (
    select g.id from grant_rank g where g.rn <= grant_limit
    union all
    select s.id from scholarship_rank s where s.rn <= scholarship_limit
  ),
  remaining_rank as (
    select
      s.*,
      row_number() over (
        order by
          s.average_score desc,
          case
            when s.support_type = 'grant' then s.motivation_score
            else s.social_need_score
          end desc,
          s.number asc,
          s.id asc
      )::integer as rn
    from scored s
    where not exists (
      select 1 from primary_winners w where w.id = s.id
    )
  ),
  grant_tie as (
    select exists (
      select 1
      from grant_rank a
      join grant_rank b on b.rn = grant_limit + 1
      where a.rn = grant_limit
        and a.average_score = b.average_score
        and a.motivation_score is not distinct from b.motivation_score
        and grant_limit > 0
    ) as value
  ),
  scholarship_tie as (
    select exists (
      select 1
      from scholarship_rank a
      join scholarship_rank b on b.rn = scholarship_limit + 1
      where a.rn = scholarship_limit
        and a.average_score = b.average_score
        and a.social_need_score is not distinct from b.social_need_score
        and scholarship_limit > 0
    ) as value
  ),
  top30_tie as (
    select exists (
      select 1
      from remaining_rank a
      join remaining_rank b on b.rn = top30_limit + 1
      where a.rn = top30_limit
        and a.average_score = b.average_score
        and (
          case when a.support_type = 'grant' then a.motivation_score else a.social_need_score end
        ) is not distinct from (
          case when b.support_type = 'grant' then b.motivation_score else b.social_need_score end
        )
        and top30_limit > 0
    ) as value
  ),
  decisions as (
    select
      g.id,
      g.number,
      g.support_type,
      g.average_score,
      g.score_count,
      case when g.rn <= grant_limit then 'grant' else null end as primary_decision,
      g.rn as primary_position
    from grant_rank g

    union all

    select
      s.id,
      s.number,
      s.support_type,
      s.average_score,
      s.score_count,
      case when s.rn <= scholarship_limit then 'scholarship' else null end as primary_decision,
      s.rn as primary_position
    from scholarship_rank s
  )
  select
    d.id as application_id,
    d.number as application_number,
    d.support_type,
    d.average_score,
    d.score_count,
    experts_count as active_experts,
    coalesce(
      d.primary_decision,
      case when rr.rn <= top30_limit then 'top30' else 'not_selected' end
    )::text as suggested_decision,
    case
      when d.primary_decision is not null then d.primary_position
      else rr.rn
    end::integer as rank_position,
    (
      (select value from grant_tie)
      or (select value from scholarship_tie)
      or (select value from top30_tie)
    ) as boundary_tie
  from decisions d
  left join remaining_rank rr on rr.id = d.id
  order by
    case coalesce(
      d.primary_decision,
      case when rr.rn <= top30_limit then 'top30' else 'not_selected' end
    )
      when 'grant' then 1
      when 'scholarship' then 2
      when 'top30' then 3
      else 4
    end,
    d.average_score desc,
    d.number asc;
end;
$$;

revoke all on function public.get_competition_results_preview(integer) from public;
grant execute on function public.get_competition_results_preview(integer) to authenticated;

-- Публичная выдача итогов без персональных данных.
create or replace function public.get_public_competition_results(
  p_cycle_id integer default 2026
)
returns table (
  application_number text,
  decision text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.number::text as application_number,
    a.decision::text,
    a.result_published_at as published_at
  from public.applications a
  where exists (
    select 1
    from public.competition_cycles c
    where c.id = p_cycle_id
      and c.status = 'results_published'
  )
    and a.status = 'result'
    and a.decision in ('grant', 'scholarship', 'top30', 'not_selected')
    and a.result_published_at is not null
  order by
    case a.decision
      when 'grant' then 1
      when 'scholarship' then 2
      when 'top30' then 3
      else 4
    end,
    a.number;
$$;

revoke all on function public.get_public_competition_results(integer) from public;
grant execute on function public.get_public_competition_results(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Публикация итогов одной транзакцией
-- ---------------------------------------------------------------------------
create or replace function public.publish_competition_results(
  p_cycle_id integer default 2026
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cycle_row public.competition_cycles;
  experts_count bigint;
  pending_admin bigint;
  incomplete_commission bigint;
  has_tie boolean;
  publish_time timestamptz := now();
  grants_count integer := 0;
  scholarships_count integer := 0;
  top30_count integer := 0;
  not_selected_count integer := 0;
  rejected_notice_count integer := 0;
  is_republish boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Недостаточно прав';
  end if;

  select * into cycle_row
  from public.competition_cycles
  where id = p_cycle_id
  for update;

  if cycle_row.id is null then
    raise exception 'Конкурсный цикл % не найден', p_cycle_id;
  end if;

  is_republish := cycle_row.status = 'results_published';

  if cycle_row.status not in ('applications_closed', 'results_published') then
    raise exception 'Сначала завершите приём заявок';
  end if;

  if is_republish and exists (
    select 1
    from public.applications a
    where a.appeal_deadline is not null
      and a.appeal_deadline > now()
  ) then
    raise exception 'Срок подачи апелляций ещё не завершён';
  end if;

  if is_republish and exists (
    select 1
    from public.appeals ap
    where ap.status in ('submitted', 'under_review')
  ) then
    raise exception 'Сначала завершите рассмотрение всех апелляций';
  end if;

  select count(*)::bigint into experts_count
  from public.commission_members cm
  where cm.active = true;

  if experts_count = 0 then
    raise exception 'Нет активных членов комиссии';
  end if;

  select count(*)::bigint into pending_admin
  from public.applications a
  where a.status in ('submitted', 'tech_review', 'needs_fixes', 'accepted');

  if pending_admin > 0 then
    raise exception 'Нельзя публиковать итоги: % заявок ещё требуют административного решения или доработки', pending_admin;
  end if;

  select count(*)::bigint into incomplete_commission
  from public.applications a
  where a.status in ('evaluation', 'final')
    and (
      select count(distinct cs.reviewer_id)
      from public.commission_scores cs
      join public.commission_members cm
        on cm.user_id = cs.reviewer_id
       and cm.active = true
      where cs.application_id = a.id
    ) < experts_count;

  if incomplete_commission > 0 then
    raise exception 'Нельзя публиковать итоги: % заявок ещё не оценены всеми активными членами комиссии', incomplete_commission;
  end if;

  select coalesce(bool_or(p.boundary_tie), false)
    into has_tie
  from public.get_competition_results_preview(p_cycle_id) p;

  if has_tie then
    raise exception 'Есть равенство итоговых баллов на границе квоты. Сначала необходимо утвердить правило разрешения ничьей';
  end if;

  -- Обновление результатов автоматически создаст competition_result
  -- через уже установленный applications_notification_queue trigger.
  with preview as (
    select *
    from public.get_competition_results_preview(p_cycle_id)
  )
  update public.applications a
  set
    decision = p.suggested_decision,
    status = 'result',
    result_published_at = publish_time,
    appeal_deadline = case
      when is_republish then null
      else public.add_working_days(publish_time, 3)
    end,
    updated_at = now()
  from preview p
  where a.id = p.application_id;

  select count(*) filter (where a.decision = 'grant'),
         count(*) filter (where a.decision = 'scholarship'),
         count(*) filter (where a.decision = 'top30'),
         count(*) filter (where a.decision = 'not_selected')
    into grants_count, scholarships_count, top30_count, not_selected_count
  from public.applications a
  where a.result_published_at = publish_time;

  -- У отклонённых заявок отменяем старые неотправленные статусы, чтобы после
  -- публикации итогов участнику не пришло устаревшее сообщение следом за финальным.
  update public.notifications n
  set
    status = 'cancelled',
    error_text = coalesce(n.error_text, 'Заменено финальным уведомлением конкурса')
  from public.applications a
  where n.application_id = a.id
    and a.status = 'rejected'
    and a.submitted_at is not null
    and n.channel = 'telegram'
    and n.status in ('pending', 'failed');

  -- Участники, чьи заявки были ранее отклонены, тоже получают финальное
  -- уведомление о завершении конкурса. Статус rejected при этом не стираем.
  insert into public.notifications (
    user_id,
    application_id,
    channel,
    event_type,
    payload,
    status
  )
  select
    a.user_id,
    a.id,
    'telegram',
    'competition_final_rejected',
    jsonb_build_object(
      'cycle_id', p_cycle_id,
      'application_id', a.id,
      'application_number', a.number,
      'status', a.status,
      'decision', 'rejected'
    ),
    'pending'
  from public.applications a
  where a.status = 'rejected'
    and a.submitted_at is not null
    and not exists (
      select 1
      from public.notifications n
      where n.application_id = a.id
        and n.channel = 'telegram'
        and n.event_type = 'competition_final_rejected'
        and n.payload ->> 'cycle_id' = p_cycle_id::text
    );

  get diagnostics rejected_notice_count = row_count;

  update public.competition_cycles
  set
    status = 'results_published',
    results_published_at = publish_time,
    published_by = (select auth.uid()),
    updated_at = publish_time
  where id = p_cycle_id;

  return jsonb_build_object(
    'ok', true,
    'cycle_id', p_cycle_id,
    'published_at', publish_time,
    'finalized_after_appeals', is_republish,
    'grant', coalesce(grants_count, 0),
    'scholarship', coalesce(scholarships_count, 0),
    'top30', coalesce(top30_count, 0),
    'not_selected', coalesce(not_selected_count, 0),
    'rejected_final_notice', coalesce(rejected_notice_count, 0)
  );
end;
$$;

revoke all on function public.publish_competition_results(integer) from public;
grant execute on function public.publish_competition_results(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Индексы
-- ---------------------------------------------------------------------------
create index if not exists applications_result_published_idx
  on public.applications(result_published_at);

create index if not exists notifications_competition_result_idx
  on public.notifications(event_type, status, created_at)
  where channel = 'telegram'
    and event_type in ('competition_result', 'competition_final_rejected');
