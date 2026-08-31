-- QazEducation — Phone Auth через Telegram Gateway
-- Выполнить ОДИН РАЗ в Supabase SQL Editor.
--
-- Phone provider + Send SMS Hook должны быть включены в Authentication.
-- Доставка OTP выполняется Edge Function telegram-send-otp -> Telegram Gateway.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    first_name,
    last_name,
    phone,
    lang,
    category
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce(
      nullif(new.raw_user_meta_data ->> 'phone', ''),
      new.phone
    ),
    coalesce(new.raw_user_meta_data ->> 'lang', 'ru'),
    new.raw_user_meta_data ->> 'category'
  )
  on conflict (id) do update
  set
    phone = coalesce(
      nullif(excluded.phone, ''),
      public.profiles.phone
    ),
    updated_at = now();

  return new;
end;
$$;

-- Подтянуть подтверждённый номер в старые профили phone-users,
-- если строка уже существовала без телефона.
update public.profiles p
set
  phone = u.phone,
  updated_at = now()
from auth.users u
where p.id = u.id
  and u.phone is not null
  and (p.phone is null or btrim(p.phone) = '');

-- Никаких Gateway/Bot токенов в БД не создаётся.
-- TELEGRAM_GATEWAY_TOKEN и SEND_SMS_HOOK_SECRET должны оставаться
-- только в Edge Functions -> Secrets.
