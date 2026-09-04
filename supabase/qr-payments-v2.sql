-- QazEducation QR v2. Apply AFTER admin-workspace-v1.sql and registration-identity-v1.sql.
-- No data deletion/backfill. Money-moving refunds are deliberately not implemented.
begin;

alter table public.payments
  add column if not exists credit_payment_id uuid references public.payments(id),
  add column if not exists is_sandbox boolean not null default false,
  add column if not exists refunded_tenge numeric(12,2) not null default 0;
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending','paid','cancelled','refunded','partially_refunded'));
-- Real duplicate charges must remain recordable; prevent duplicate creation with a user lock.
drop index if exists public.payments_one_paid_per_type_idx;
create index if not exists payments_confirmed_type_idx
  on public.payments(user_id,payment_type) where status='paid';
revoke insert,update,delete on public.payments from anon,authenticated;

create or replace function public.qz_has_competition_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.payments p
    where p.user_id=p_user_id and p.payment_type='competition_fee'
      and p.status='paid' and not p.is_sandbox and p.refunded_tenge=0
      and (p.amount_tenge=10000 or (
        p.amount_tenge=7000 and exists(
          select 1 from public.payments c
          where c.id=p.credit_payment_id and c.user_id=p.user_id
            and c.payment_type='university_match' and c.amount_tenge=3000
            and c.status='paid' and not c.is_sandbox and c.refunded_tenge=0
        )
      ))
  );
$$;
revoke all on function public.qz_has_competition_access(uuid) from public,anon,authenticated;
grant execute on function public.qz_has_competition_access(uuid) to service_role;

create or replace function public.get_own_payment_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid := auth.uid(); competition boolean; matched boolean;
begin
  if u is null then raise exception 'Требуется вход'; end if;
  competition := public.qz_has_competition_access(u);
  select exists(select 1 from public.payments where user_id=u
    and payment_type='university_match' and amount_tenge=3000 and status='paid'
    and not is_sandbox and refunded_tenge=0) into matched;
  return jsonb_build_object('competition_paid',competition,
    'match_paid',competition or matched,'competition_amount_due',
    case when competition then 0 when matched then 7000 else 10000 end);
end;
$$;
revoke all on function public.get_own_payment_access() from public,anon;
grant execute on function public.get_own_payment_access() to authenticated;

-- This function, not a browser-provided amount, decides the price and credit.
create or replace function public.qz_reserve_apipay_payment(
  p_user_id uuid, p_payment_type text, p_sandbox boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.payments; credit public.payments; a public.applications;
  charge integer; completed boolean;
begin
  if p_payment_type not in ('competition_fee','university_match') then
    raise exception 'invalid_payment_type';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  if p_sandbox then raise exception 'Sandbox checkout is not enabled in this production migration'; end if;
  completed := public.qz_has_competition_access(p_user_id);
  select * into credit from public.payments where user_id=p_user_id
    and payment_type='university_match' and status='paid' and amount_tenge=3000
    and not is_sandbox and refunded_tenge=0 order by created_at desc limit 1;
  if completed or (p_payment_type='university_match' and credit.id is not null) then
    return jsonb_build_object('already_paid',true);
  end if;
  if exists(select 1 from public.payments where user_id=p_user_id and provider='apipay'
    and (status in ('refunded','partially_refunded') or refunded_tenge>0
      or (payment_type='competition_fee' and status='paid'))) then
    raise exception 'Платёж требует сверки. Не оплачивайте повторно; обратитесь в поддержку';
  end if;
  -- One unresolved invoice per person, including requests from different tabs/products.
  select * into p from public.payments where user_id=p_user_id and provider='apipay'
    and status='pending' order by created_at asc limit 1 for update;
  if p.id is not null then
    return jsonb_build_object('created',false,'payment',to_jsonb(p),
      'other_package',p.payment_type<>p_payment_type);
  end if;
  if p_payment_type='competition_fee' and credit.id is not null then
    raise exception 'Доплата 7 000 ₸ временно недоступна: для неё ещё не подключена отдельная позиция каталога. Не оплачивайте повторно; обратитесь в поддержку';
  end if;
  if p_payment_type='competition_fee' then
    select * into a from public.applications where user_id=p_user_id;
    if a.id is null then raise exception 'Сначала создайте и заполните заявку'; end if;
    if a.status not in ('draft','awaiting_payment','ready_to_submit','needs_fixes') then
      raise exception 'Для текущего статуса заявки оплата недоступна';
    end if;
    perform public.qz_validate_application_for_user(p_user_id);
    if not exists(select 1 from public.competition_cycles where id=2026
      and payment_available and status='open'
      and now() between applications_open_at and applications_close_at) and a.status<>'needs_fixes' then
      raise exception 'Приём заявок закрыт';
    end if;
  end if;
  charge := case when p_payment_type='university_match' then 3000
    when credit.id is not null then 7000 else 10000 end;
  insert into public.payments(user_id,payment_type,amount_tenge,status,provider,credit_payment_id,is_sandbox,metadata)
  values(p_user_id,p_payment_type,charge,'pending','apipay',
    case when charge=7000 then credit.id else null end,false,
    jsonb_build_object('application_id',a.id,'application_number',a.number,
      'payment_mode','qr','creation_state','creating','qr_creation_started_at',now()))
  returning * into p;
  if p_payment_type='competition_fee' then
    update public.applications set status='awaiting_payment',updated_at=now()
    where id=a.id and status in ('draft','ready_to_submit');
  end if;
  return jsonb_build_object('created',true,'payment',to_jsonb(p));
end;
$$;
revoke all on function public.qz_reserve_apipay_payment(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.qz_reserve_apipay_payment(uuid,text,boolean) to service_role;

create or replace function public.qz_validate_application_for_user(p_user_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.applications;
  participant_birth date;
  participant_age integer;
  foreign_allowed boolean := false;
begin
  select *
    into app
  from public.applications a
  where a.user_id = p_user_id
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

  if coalesce(app.data ->> 'participant_scope','') not in ('kz_citizen', 'foreign') then
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
        and d.user_id = p_user_id
        and d.kind = 'identity'
    ) then
      raise exception 'Загрузите удостоверение личности';
    end if;
  else
    if not exists (
      select 1
      from public.application_documents d
      where d.application_id = app.id
        and d.user_id = p_user_id
        and d.kind = 'birth_certificate'
    ) then
      raise exception 'Загрузите свидетельство о рождении';
    end if;

    if not exists (
      select 1
      from public.application_documents d
      where d.application_id = app.id
        and d.user_id = p_user_id
        and d.kind = 'guardian_identity'
    ) then
      raise exception 'Загрузите документ законного представителя';
    end if;

    if not exists (
      select 1
      from public.application_documents d
      where d.application_id = app.id
        and d.user_id = p_user_id
        and d.kind = 'guardian_consent'
    ) then
      raise exception 'Загрузите согласие законного представителя';
    end if;
  end if;

  if not exists (
    select 1
    from public.application_documents d
    where d.application_id = app.id
      and d.user_id = p_user_id
      and d.kind in ('performance', 'academic_record')
  ) then
    raise exception 'Загрузите аттестат или транскрипт';
  end if;

  if not exists(select 1 from public.profiles p where p.id=p_user_id
    and nullif(trim(p.first_name),'') is not null and nullif(trim(p.last_name),'') is not null
    and p.terms_accepted_at is not null and p.privacy_accepted_at is not null) then
    raise exception 'Заполните имя, фамилию и подтвердите согласия в профиле';
  end if;
  return app;
end;
$$;
revoke all on function public.qz_validate_application_for_user(uuid) from public,anon,authenticated;
grant execute on function public.qz_validate_application_for_user(uuid) to service_role;

create or replace function public.qz_submit_application_for_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare app public.applications; is_resubmission boolean; submitted_time timestamptz;
begin
  app := public.qz_validate_application_for_user(p_user_id);
  if not public.qz_has_competition_access(p_user_id) then
    raise exception 'Оплата пакета участия не подтверждена';
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

revoke all on function public.qz_submit_application_for_user(uuid) from public,anon,authenticated;
grant execute on function public.qz_submit_application_for_user(uuid) to service_role;

create or replace function public.qz_try_submit_paid_application(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.applications; result jsonb;
begin
  select * into a from public.applications where user_id=p_user_id for update;
  if a.id is null then return jsonb_build_object('submitted',false,'reason','application_missing'); end if;
  if a.status not in ('draft','awaiting_payment','ready_to_submit','needs_fixes') then
    return jsonb_build_object('submitted',a.submitted_at is not null,'status',a.status,'application_id',a.id);
  end if;
  if a.status='needs_fixes' then
    return jsonb_build_object('submitted',false,'status',a.status,'reason','Завершите доработку заявки');
  end if;
  if not public.qz_has_competition_access(p_user_id) then
    return jsonb_build_object('submitted',false,'reason','payment_required');
  end if;
  -- A failed/incomplete submission must NEVER roll back the confirmed payment.
  begin
    result := public.qz_submit_application_for_user(p_user_id);
    return result || jsonb_build_object('submitted',true);
  exception when others then
    return jsonb_build_object('submitted',false,'status',a.status,'reason',
      case when sqlstate='P0001' then sqlerrm else 'Не удалось завершить проверку заявки. Обратитесь в поддержку.' end,
      'check_error',sqlstate);
  end;
end;
$$;
revoke all on function public.qz_try_submit_paid_application(uuid) from public,anon,authenticated;
grant execute on function public.qz_try_submit_paid_application(uuid) to service_role;

-- Keep old frontend RPC names but share the exact same server validation.
create or replace function public.submit_own_application_v2()
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a public.applications;
begin
  if u is null then raise exception 'Требуется вход'; end if;
  select * into a from public.applications where user_id=u for update;
  if a.id is null then raise exception 'Заявка не найдена'; end if;
  if a.submitted_at is not null and a.status not in ('draft','awaiting_payment','ready_to_submit','needs_fixes') then
    return jsonb_build_object('submitted',true,'status',a.status,'application_id',a.id);
  end if;
  if not public.qz_has_competition_access(u) then
    return jsonb_build_object('submitted',false,'status','awaiting_payment','payment_required',true);
  end if;
  return public.qz_submit_application_for_user(u)||jsonb_build_object('submitted',true);
end;
$$;
create or replace function public.submit_own_application()
returns jsonb language sql security definer set search_path='' as $$
  select public.submit_own_application_v2();
$$;
revoke all on function public.submit_own_application() from public,anon;
revoke all on function public.submit_own_application_v2() from public,anon;
grant execute on function public.submit_own_application() to authenticated;
grant execute on function public.submit_own_application_v2() to authenticated;

-- Only RPCs/service backend may change application statuses/consent timestamps.
revoke update on public.applications from authenticated;
grant update(data,progress) on public.applications to authenticated;
create or replace function public.qz_guard_application_insert()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (
    new.status<>'draft' or new.submitted_at is not null or new.terms_accepted_at is not null
  ) then raise exception 'Подача заявки доступна только через серверную проверку'; end if;
  return new;
end;
$$;
drop trigger if exists qz_application_insert_guard on public.applications;
create trigger qz_application_insert_guard before insert on public.applications
  for each row execute function public.qz_guard_application_insert();

create or replace function public.qz_apply_apipay_snapshot(
  p_payment_id uuid,p_invoice jsonb,p_event_key text,p_expected_sandbox boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.payments; next_status text; provider_status text; amount numeric;
  refund_amount numeric; event_added boolean; submission jsonb;
begin
  select * into p from public.payments where id=p_payment_id and provider='apipay' for update;
  if p.id is null then raise exception 'payment_not_found'; end if;
  if p_invoice->>'external_order_id' is distinct from p.id::text
    or coalesce(p_invoice->>'id','')!~'^[1-9][0-9]*$'
    or (p.provider_payment_id is not null and p.provider_payment_id<>p_invoice->>'id')
    then raise exception 'invoice_order_mismatch'; end if;
  if jsonb_typeof(p_invoice->'is_sandbox') is distinct from 'boolean'
    or (p_invoice->>'is_sandbox')::boolean is distinct from p_expected_sandbox
    or p.is_sandbox is distinct from p_expected_sandbox then raise exception 'payment_environment_mismatch'; end if;
  if coalesce(p_invoice->>'amount','')!~'^[0-9]{1,9}([.][0-9]{1,2})?$' then raise exception 'invalid_amount'; end if;
  amount:=(p_invoice->>'amount')::numeric;
  if amount<>p.amount_tenge or (p_invoice ? 'currency' and p_invoice->>'currency'<> 'KZT') then
    raise exception 'payment_amount_mismatch'; end if;
  provider_status:=p_invoice->>'status';
  if provider_status is null or provider_status not in ('processing','pending','paid','cancelled','expired','error','partially_refunded') then
    raise exception 'unknown_invoice_status'; end if;
  if coalesce(p_invoice->>'total_refunded','0')!~'^[0-9]{1,9}([.][0-9]{1,2})?$' then
    raise exception 'invalid_refund_total'; end if;
  refund_amount:=coalesce((p_invoice->>'total_refunded')::numeric,0);
  if refund_amount>amount or (p_invoice->>'is_fully_refunded'='true' and refund_amount<>amount)
    or (provider_status='partially_refunded' and refund_amount=0) then raise exception 'invalid_refund_total'; end if;
  insert into public.payment_webhook_events(event_key,provider,payload)
    values(p_event_key,'apipay',p_invoice) on conflict(event_key) do nothing returning true into event_added;
  if not coalesce(event_added,false) then
    return jsonb_build_object('ok',true,'duplicate',true,'status',p.status,'user_id',p.user_id);
  end if;
  -- Refund totals and an already confirmed payment never regress on stale delivery.
  refund_amount:=greatest(p.refunded_tenge,refund_amount);
  next_status:=case
    when refund_amount>=amount then 'refunded'
    when refund_amount>0 then 'partially_refunded'
    when p.status in ('refunded','partially_refunded') then p.status
    when provider_status='paid' or p.status='paid' then 'paid'
    when provider_status in ('cancelled','expired','error') then 'cancelled'
    when p.status='cancelled' then 'cancelled'
    else 'pending' end;
  update public.payments set status=next_status,provider_payment_id=p_invoice->>'id',
    refunded_tenge=refund_amount,
    paid_at=case when next_status in ('paid','refunded','partially_refunded')
      then coalesce(p.paid_at,(p_invoice->>'paid_at')::timestamptz,now()) else p.paid_at end,
    metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object(
      'apipay_status',case when next_status='paid' then 'paid' else provider_status end,
      'creation_state','resolved','last_event_key',p_event_key,
      'last_provider_snapshot',p_invoice,
      'qr_substate',case when p.metadata->>'qr_substate'='scanned' then 'scanned'
        else p_invoice->>'qr_substate' end,
      'qr_expires_at',coalesce(p_invoice->>'qr_expires_at',p.metadata->>'qr_expires_at'),
      'qr_image_url',coalesce(p_invoice->>'qr_image_url',p.metadata->>'qr_image_url'),
      'qr_token_url',coalesce(p_invoice->>'qr_token_url',p.metadata->>'qr_token_url'),
      'payment_review_required',refund_amount>0),
    updated_at=now()
    where id=p.id;
  if p.payment_type='competition_fee' and next_status='paid' then
    submission:=public.qz_try_submit_paid_application(p.user_id);
  end if;
  return jsonb_build_object('ok',true,'status',next_status,'user_id',p.user_id,'submission',submission);
end;
$$;
revoke all on function public.qz_apply_apipay_snapshot(uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.qz_apply_apipay_snapshot(uuid,jsonb,text,boolean) to service_role;
-- Block the old, amount-unchecked write path. Deploy the two new functions together.
revoke all on function public.apply_apipay_payment_event(text,text,text,text,timestamptz,jsonb) from service_role;

-- Preserve the existing admin workflow and replace only its hard-coded price check.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.admin_transition_application(uuid,text,text)'::regprocedure);
  if position('and p.amount_tenge = 10000' in definition)>0 then
    definition:=replace(definition,'and p.amount_tenge = 10000',
      'and public.qz_has_competition_access(app.user_id)');
    definition:=replace(definition,'Оплата 10 000 ₸ не подтверждена','Оплата пакета участия не подтверждена');
    execute definition;
  elsif position('qz_has_competition_access' in definition)=0 then
    raise exception 'Unexpected admin_transition_application definition: review migration manually';
  end if;
end;
$$;


-- Cross-tab throttling. This is a lease, not evidence of payment.
-- POST /invoices/qr returns a short QR object, not the complete Invoice schema.
-- Attach only its reference/image; paid still requires a verified GET snapshot.
create or replace function public.qz_attach_apipay_qr(p_payment_id uuid,p_qr jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare p public.payments;
begin
  select * into p from public.payments where id=p_payment_id and provider='apipay' for update;
  if p.id is null then raise exception 'payment_not_found'; end if;
  if coalesce(p_qr->>'id','')!~'^[1-9][0-9]*$'
    or (p.provider_payment_id is not null and p.provider_payment_id<>p_qr->>'id') then
    raise exception 'invoice_order_mismatch'; end if;
  if coalesce(p_qr->>'amount','')!~'^[0-9]{1,9}([.][0-9]{1,2})?$'
    or (p_qr->>'amount')::numeric<>p.amount_tenge then raise exception 'payment_amount_mismatch'; end if;
  update public.payments set provider_payment_id=p_qr->>'id',
    metadata=coalesce(p.metadata,'{}'::jsonb)||jsonb_build_object(
      'creation_state',case when p.metadata->>'creation_state'='resolved' then 'resolved' else 'awaiting_verification' end,
      'qr_image_url',coalesce(p_qr->>'qr_image_url',p.metadata->>'qr_image_url'),
      'qr_token_url',coalesce(p_qr->>'qr_token_url',p.metadata->>'qr_token_url'),
      'qr_expires_at',coalesce(p_qr->>'qr_expires_at',p.metadata->>'qr_expires_at')),
    updated_at=now()
  where id=p.id;
end;
$$;
revoke all on function public.qz_attach_apipay_qr(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.qz_attach_apipay_qr(uuid,jsonb) to service_role;

alter table public.payments add column if not exists provider_checked_at timestamptz;
create or replace function public.qz_claim_payment_poll(p_payment_id uuid,p_interval_seconds integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
  update public.payments set provider_checked_at=now()
  where id=p_payment_id and provider='apipay' and
    (provider_checked_at is null or provider_checked_at<now()-make_interval(secs=>greatest(5,p_interval_seconds)))
  returning id into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.qz_claim_payment_poll(uuid,integer) from public,anon,authenticated;
grant execute on function public.qz_claim_payment_poll(uuid,integer) to service_role;

commit;
