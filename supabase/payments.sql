-- QazEducation — платежи и доступ к сервису «Подбор вуза».
-- Выполнить в Supabase SQL Editor после schema.sql и applications.sql.
--
-- Логика:
--   competition_fee  = организационный платеж 10 000 ₸
--   university_match = отдельная услуга «Подбор вуза» 3 000 ₸
--
-- Любой подтверждённый competition_fee автоматически даёт доступ
-- к подбору вуза без отдельной оплаты 3 000 ₸.

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  payment_type        text not null,
  amount_tenge        integer not null check (amount_tenge > 0),
  status              text not null default 'pending',
  provider            text,
  provider_payment_id text,
  metadata            jsonb not null default '{}'::jsonb,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.payments drop constraint if exists payments_type_check;
alter table public.payments add constraint payments_type_check
  check (payment_type in ('competition_fee', 'university_match'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'paid', 'cancelled', 'refunded'));

create index if not exists payments_user_status_idx
  on public.payments (user_id, status);

create index if not exists payments_user_type_idx
  on public.payments (user_id, payment_type);

create unique index if not exists payments_apipay_provider_id_idx
  on public.payments (provider_payment_id)
  where provider = 'apipay' and provider_payment_id is not null;

-- Один действующий подтверждённый платёж каждого типа на пользователя.
create unique index if not exists payments_one_paid_per_type_idx
  on public.payments (user_id, payment_type)
  where status = 'paid';

-- updated_at
drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at
  before update on public.payments
  for each row execute function public.touch_updated_at();

-- RLS ------------------------------------------------------------------------
alter table public.payments enable row level security;

-- Пользователь может только читать свои платежи.
-- Создание/подтверждение платежа выполняется админкой или серверным webhook
-- с service_role. Клиент НЕ должен иметь возможность сам поставить status='paid'.
drop policy if exists "Платежи: чтение своих" on public.payments;
create policy "Платежи: чтение своих"
  on public.payments for select
  using (auth.uid() = user_id);

-- Политики INSERT / UPDATE / DELETE для обычного пользователя намеренно
-- не создаются. Service role обходит RLS.

-- Журнал входящих событий ApiPay. Первичный ключ делает обработку повторных
-- доставок идемпотентной: одно событие не может примениться дважды.
create table if not exists public.payment_webhook_events (
  event_key   text primary key,
  provider    text not null,
  payload     jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

alter table public.payment_webhook_events enable row level security;

-- Атомарно фиксирует событие ApiPay и обновляет платёж/заявку.
-- Вызывается только серверной Edge Function с service_role.
create or replace function public.apply_apipay_payment_event(
  p_event_key text,
  p_provider_payment_id text,
  p_external_order_id text,
  p_provider_status text,
  p_paid_at timestamptz default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_event boolean := false;
  next_status text;
  payment_row public.payments;
  external_payment_id uuid;
begin
  insert into public.payment_webhook_events (event_key, provider, payload)
  values (p_event_key, 'apipay', coalesce(p_payload, '{}'::jsonb))
  on conflict (event_key) do nothing
  returning true into inserted_event;

  if not coalesce(inserted_event, false) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  next_status := case lower(coalesce(p_provider_status, ''))
    when 'paid' then 'paid'
    when 'refunded' then 'refunded'
    when 'partially_refunded' then 'refunded'
    when 'cancelled' then 'cancelled'
    when 'expired' then 'cancelled'
    when 'error' then 'cancelled'
    else 'pending'
  end;

  external_payment_id := case
    when coalesce(p_external_order_id, '') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    then p_external_order_id::uuid
    else null
  end;

  update public.payments p
  set
    status = next_status,
    provider_payment_id = coalesce(p.provider_payment_id, p_provider_payment_id),
    paid_at = case
      when next_status = 'paid' then coalesce(p_paid_at, p.paid_at, now())
      else p.paid_at
    end,
    metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
      'apipay_status', p_provider_status,
      'last_event_key', p_event_key,
      'apipay_event', coalesce(p_payload ->> 'event', 'invoice.status_changed'),
      'qr_substate', coalesce(
        p_payload -> 'invoice' ->> 'qr_substate',
        p_payload ->> 'qr_substate',
        p.metadata ->> 'qr_substate'
      ),
      'qr_expires_at', coalesce(
        p_payload -> 'invoice' ->> 'qr_expires_at',
        p_payload ->> 'qr_expires_at',
        p.metadata ->> 'qr_expires_at'
      )
    ),
    updated_at = now()
  where p.provider = 'apipay'
    and (
      p.provider_payment_id = p_provider_payment_id
      or (external_payment_id is not null and p.id = external_payment_id)
    )
  returning p.* into payment_row;

  if payment_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'payment_not_found');
  end if;

  if payment_row.payment_type = 'competition_fee' and next_status = 'paid' then
    update public.applications
    set status = 'ready_to_submit', updated_at = now()
    where user_id = payment_row.user_id
      and status in ('draft', 'awaiting_payment', 'ready_to_submit');
  elsif payment_row.payment_type = 'competition_fee'
        and next_status in ('cancelled', 'refunded') then
    update public.applications
    set status = 'awaiting_payment', updated_at = now()
    where user_id = payment_row.user_id
      and status in ('draft', 'awaiting_payment', 'ready_to_submit');
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'payment_id', payment_row.id,
    'status', next_status,
    'user_id', payment_row.user_id
  );
end;
$$;

revoke all on function public.apply_apipay_payment_event(text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_apipay_payment_event(text, text, text, text, timestamptz, jsonb)
  to service_role;

-- Пример ручной отметки об оплате участия 10 000 ₸ для теста:
-- insert into public.payments
--   (user_id, payment_type, amount_tenge, status, provider, paid_at)
-- values
--   ('USER_UUID', 'competition_fee', 10000, 'paid', 'manual', now());

-- Пример ручной отметки отдельной оплаты подбора вуза 3 000 ₸:
-- insert into public.payments
--   (user_id, payment_type, amount_tenge, status, provider, paid_at)
-- values
--   ('USER_UUID', 'university_match', 3000, 'paid', 'manual', now());
