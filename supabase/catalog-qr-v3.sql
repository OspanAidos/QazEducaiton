-- QazEducation catalog QR v3. Apply AFTER qr-payments-v2.sql.
-- No data deletion or backfill. Existing paid access remains unchanged.
begin;

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
  -- Keep an already-created unresolved invoice visible and block duplicates.
  select * into p from public.payments where user_id=p_user_id and provider='apipay'
    and status='pending' order by created_at asc limit 1 for update;
  if p.id is not null then
    return jsonb_build_object('created',false,'payment',to_jsonb(p),
      'other_package',p.payment_type<>p_payment_type);
  end if;
  -- ApiPay requires catalogue items for this organisation. There is no approved
  -- 7,000-tenge catalogue item yet, so do not reserve or submit a top-up order.
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
  charge := case when p_payment_type='university_match' then 3000 else 10000 end;
  insert into public.payments(user_id,payment_type,amount_tenge,status,provider,credit_payment_id,is_sandbox,metadata)
  values(p_user_id,p_payment_type,charge,'pending','apipay',null,false,
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

commit;
