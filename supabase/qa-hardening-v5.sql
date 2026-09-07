-- QazEducation — итоговое усиление после полного QA, v5.
-- Выполнять ПОСЛЕ qr-payments-v2.sql, catalog-qr-v3.sql и certificates-server-v2.sql.
-- Миграция идемпотентна и не удаляет заявки, платежи, документы или сертификаты.

begin;

-- В цикле 2026 иностранные участники допущены условиями программы.
update public.competition_cycles
set allows_foreign_participants = true,
    updated_at = now()
where id = 2026;

-- Подтвердить оплату может только серверный ApiPay webhook.
drop policy if exists "Админ: менять платежи" on public.payments;
revoke insert, update, delete on public.payments from authenticated;
grant select on public.payments to authenticated;

-- Telegram-связь, телефон и серверные отметки согласий нельзя менять напрямую
-- из браузера. Регистрация обновляет их через защищённую RPC-функцию.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Номер заявки всегда назначается базой, включая безопасный fallback,
-- если создание заявки при регистрации пришлось повторить.
create sequence if not exists public.application_seq start 1;

create or replace function public.qz_assign_application_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(new.number), '') is null then
    new.number := 'QE-' || to_char(coalesce(new.created_at, now()), 'YYYY') || '-' ||
      lpad(nextval('public.application_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

revoke all on function public.qz_assign_application_number()
  from public, anon, authenticated;

drop trigger if exists applications_assign_number on public.applications;
create trigger applications_assign_number
  before insert on public.applications
  for each row execute function public.qz_assign_application_number();

update public.applications
set number = 'QE-' || to_char(created_at, 'YYYY') || '-' ||
  lpad(nextval('public.application_seq')::text, 6, '0')
where nullif(trim(number), '') is null;

-- Участник создаёт только собственную пустую заявку и меняет только черновые
-- данные. Статусы, решение, дедлайны и служебные поля остаются серверными.
revoke insert, update, delete on public.applications from authenticated;
grant select on public.applications to authenticated;
grant insert(user_id) on public.applications to authenticated;
grant update(data, progress) on public.applications to authenticated;

-- Атомарное объединение полей черновика: параллельные автосохранения больше
-- не перезаписывают изменения друг друга.
create or replace function public.save_own_application_draft(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  result public.applications;
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Некорректные данные черновика';
  end if;

  if octet_length(p_patch::text) > 100000 then
    raise exception 'Черновик превышает допустимый размер';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as item(key)
    where item.key not in (
      'birth',
      'category',
      'participant_scope',
      'citizenship_country',
      'support_type',
      'university',
      'specialty',
      'motivation',
      'consent_data',
      'consent_terms',
      'consent_version'
    )
  ) then
    raise exception 'Черновик содержит недопустимые поля';
  end if;

  update public.applications a
  set data = coalesce(a.data, '{}'::jsonb) || p_patch,
      updated_at = now()
  where a.user_id = current_user_id
    and a.status in ('draft', 'awaiting_payment', 'ready_to_submit', 'needs_fixes')
  returning a.* into result;

  if result.id is null then
    raise exception 'Заявка недоступна для редактирования';
  end if;

  return jsonb_build_object(
    'ok', true,
    'application_id', result.id,
    'status', result.status,
    'data', result.data,
    'updated_at', result.updated_at
  );
end;
$$;

revoke all on function public.save_own_application_draft(jsonb)
  from public, anon;
grant execute on function public.save_own_application_draft(jsonb)
  to authenticated;

commit;
