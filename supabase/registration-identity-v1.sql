-- QazEducation — настоящее имя и фамилия участника при регистрации.
-- Выполнить после schema.sql и telegram-bot-auth.sql.

create or replace function public.complete_participant_registration(
  p_first_name text,
  p_last_name text,
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_first_name text := trim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g'));
  clean_last_name text := trim(regexp_replace(coalesce(p_last_name, ''), '\s+', ' ', 'g'));
  clean_terms_version text := trim(coalesce(p_terms_version, ''));
  accepted_at timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Требуется авторизация';
  end if;

  if char_length(clean_first_name) not between 2 and 80
     or clean_first_name !~ '^[[:alpha:]][[:alpha:] ''’.-]*[[:alpha:]]$' then
    raise exception 'Укажите настоящее имя от 2 до 80 букв';
  end if;

  if char_length(clean_last_name) not between 2 and 80
     or clean_last_name !~ '^[[:alpha:]][[:alpha:] ''’.-]*[[:alpha:]]$' then
    raise exception 'Укажите настоящую фамилию от 2 до 80 букв';
  end if;

  if clean_terms_version = '' then
    raise exception 'Не указана версия документов';
  end if;

  insert into public.profiles (
    id,
    first_name,
    last_name,
    privacy_accepted_at,
    terms_accepted_at,
    terms_version,
    updated_at
  )
  values (
    current_user_id,
    clean_first_name,
    clean_last_name,
    accepted_at,
    accepted_at,
    clean_terms_version,
    accepted_at
  )
  on conflict (id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    privacy_accepted_at = excluded.privacy_accepted_at,
    terms_accepted_at = excluded.terms_accepted_at,
    terms_version = excluded.terms_version,
    updated_at = excluded.updated_at;

  -- Синхронизируем только введённые на сайте данные. Telegram name/username
  -- намеренно не используются как ФИО.
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object(
      'first_name', clean_first_name,
      'last_name', clean_last_name,
      'profile_name_source', 'participant_registration'
    ),
    updated_at = accepted_at
  where id = current_user_id;

  return jsonb_build_object(
    'ok', true,
    'first_name', clean_first_name,
    'last_name', clean_last_name,
    'accepted_at', accepted_at,
    'terms_version', clean_terms_version
  );
end;
$$;

revoke all on function public.complete_participant_registration(text, text, text)
  from public, anon;
grant execute on function public.complete_participant_registration(text, text, text)
  to authenticated;
