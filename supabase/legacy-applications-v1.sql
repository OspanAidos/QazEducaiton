-- QazEducation — безопасный импорт 48 записей со старого сайта.
-- Выполнить после admin-panel.sql и applications.sql.
-- Скрипт идемпотентен: повторный запуск обновляет ту же запись по source_key.

set datestyle = 'ISO, DMY';

create table if not exists public.legacy_applications (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  full_name text not null,
  email text,
  phone text,
  flow text,
  university_match_paid boolean not null default false,
  source_status text,
  mapped_status text not null default 'draft'
    check (mapped_status in ('draft', 'awaiting_payment')),
  registered_on date,
  linked_user_id uuid references auth.users(id) on delete set null,
  linked_application_id uuid references public.applications(id) on delete set null,
  source_file text not null,
  source_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legacy_applications_phone_idx
  on public.legacy_applications(phone);
create index if not exists legacy_applications_email_idx
  on public.legacy_applications(lower(email));
create index if not exists legacy_applications_linked_user_idx
  on public.legacy_applications(linked_user_id);

alter table public.legacy_applications enable row level security;

drop policy if exists "Админ: читать старые заявки" on public.legacy_applications;
create policy "Админ: читать старые заявки"
  on public.legacy_applications for select
  using ((select public.is_admin()));

create or replace function public.normalize_contact_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) = 11
      and regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') like '8%'
      then '7' || substring(regexp_replace(p_phone, '[^0-9]', '', 'g') from 2)
    else regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
  end;
$$;

revoke all on function public.normalize_contact_phone(text) from public;

insert into public.legacy_applications (
  source_key,
  full_name,
  email,
  phone,
  flow,
  university_match_paid,
  source_status,
  mapped_status,
  registered_on,
  source_file,
  source_payload
)
values
  ('OLD-2026-0001', 'Bulatova Madina', 'madina.0710@mail.ru', '+77715994773', 'заявка', false, 'Ожидает оплату', 'awaiting_payment', '19.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Ожидает оплату"}'::jsonb),
  ('OLD-2026-0002', 'Мелдебек Қаракөз Нұрланқызы', 'karakozmeldebek@icloud.com', '+77715936735', 'заявка', false, 'Черновик', 'draft', '17.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0003', 'Ауғанбек Ертас', 'auganbekertas16@gmail.com', '+77761484116', 'заявка', false, 'Черновик', 'draft', '15.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0004', 'Қабдылнұр Бекнұр', 'beknurkabdylnur@gmail.com', '77718196541', 'заявка', false, 'Черновик', 'draft', '14.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0005', 'aidos ospam', 'ospanaidos.00@gmail.com', '+77473472140', 'заявка', false, 'Черновик', 'draft', '14.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0006', 'Danagul Syrymbek', 'danagulsyrymbek09@icloud.com', '+77772125274', 'заявка', false, 'Черновик', 'draft', '12.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0007', 'Урманова Махнура', 'mahnura.08@icloud.com', '+77085142557', null, false, null, 'draft', '12.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0008', 'Қайрғазы Балжан', 'bkayirgazy@gmail.com', null, 'заявка', false, 'Черновик', 'draft', '12.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0009', 'Сапақ Мадияр', 'sapakov_0707@mail.ru', '+77781672847', 'заявка', false, 'Черновик', 'draft', '11.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0010', 'Русkfy', 'rusdaurenosv@gmail.com', '+77077880099', null, false, null, 'draft', '11.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0011', 'Клара Жумадилова', 'zumadilovaklara829@gmail.com', '77787796679', 'заявка', false, 'Черновик', 'draft', '11.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0012', 'Бексултанова Ляззат', 'beksultanova.la@gmail.com', '+77782599600', 'заявка', false, 'Черновик', 'draft', '10.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0013', 'Малик Жанару', 'malik_zhanaru@mail.ru', null, null, false, null, 'draft', '09.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0014', 'Асхатқызы Күнсұлу', 'kunsuluaskhatkyzy@gmail.com', '+77475658460', 'заявка', false, 'Черновик', 'draft', '08.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0015', 'Ainur Kuanyshova', 'aynur.kuanishova@gmail.com', '+77052627984', 'заявка', false, 'Черновик', 'draft', '07.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0016', 'Бауыржан Бекжан', 'baurzhanbekzhan01@gmail.com', '+77787200880', null, false, null, 'draft', '07.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0017', 'Sabina Kuskadamova', 'Sabikosha030@gmail.com', '+77053379895', 'заявка', false, 'Черновик', 'draft', '07.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0018', 'Жаңбырбай Әсемгүл', 'asemgulzanbyrbaj@gmail.com', '+77076523509', 'заявка', false, 'Черновик', 'draft', '07.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0019', 'Құрал Елдана', 'eldanakural4@gmail.com', '+77473859621', 'заявка', false, 'Черновик', 'draft', '07.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0020', 'Тұрсынхан Мадина', 'madina.tursynkhan07@mail.ru', null, null, false, null, 'draft', '07.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0021', 'Амангелді Досби', 'tyr_sayran@mail.ru', '+77053616185', null, false, null, 'draft', '07.08.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0022', 'Rinat Ahmetkali', 'rinat10.10@icloud.com', '+77027326242', 'заявка', false, 'Ожидает оплату', 'awaiting_payment', '30.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Ожидает оплату"}'::jsonb),
  ('OLD-2026-0023', 'Каусар Русланкызы', 'maruishdgdd@mail.ru', '+77076292119', null, false, null, 'draft', '25.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0024', 'Ару', 'hisokiff@gmail.com', '+77059065412', 'заявка', false, 'Черновик', 'draft', '24.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0025', 'Аружан', 'arukauzumaki@gmail.com', '+77471080175', null, false, null, 'draft', '24.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0026', 'Каусар Русланкызы', 'kausar_ruslankyzy@mail.ru', '77059908269', 'заявка', false, 'Черновик', 'draft', '23.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0027', 'Гульжан', 'iakim.gul12@gmail.com', '77072694013', 'заявка', false, 'Черновик', 'draft', '23.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0028', 'Сейфулла Дильназ', 'dilnazseifulla@gmail.com', '+77086746681', null, false, null, 'draft', '21.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0029', 'Балнур Каршыга', 'karshygabalnur@gmail.com', '+77071541612', null, false, null, 'draft', '21.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0030', 'Армангуль Koishibai', 'aiymnurai27@gmail.com', '+77086189174', 'заявка', false, 'Черновик', 'draft', '19.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0031', 'Амангелды Меруерт', 'amangeldy-2026@bk.ru', '77770956060', 'заявка', false, 'Черновик', 'draft', '19.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0032', 'Сапақпай Ұлмекен Сафарәліқызы', 'ulmekensapakbai@gmail.com', '+77715344936', 'заявка', false, 'Черновик', 'draft', '19.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0033', 'Aqiles Masaqova', 'cool.octr2022@gmail.com', '+77051006951', 'заявка', false, 'Черновик', 'draft', '19.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0034', 'Мади Аяулым', 'ayaulym.madi.2008@gmail.com', '+77776665152', 'заявка', false, 'Черновик', 'draft', '18.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0035', 'Zhalgas Serikov', 'zhalgasserikov61@gmail.com', null, 'заявка', false, 'Черновик', 'draft', '17.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0036', 'Arysbek Nuray', 'nurajarysbek@gmail.com', '+77471300459', 'заявка', false, 'Черновик', 'draft', '17.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0037', 'Сериков Жалғас', null, '+77753284561', null, false, null, 'draft', '17.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0038', 'Ыбырайым Курымбай', 'kurymbay.ybyraiym17@gmail.com', '77075162156', 'заявка', false, 'Черновик', 'draft', '17.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0039', 'Ұлпия Құрманхан', 'ulyazhan.07@gmail.com', '+77057161361', 'заявка', false, 'Черновик', 'draft', '17.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0040', 'Құрманхан Ұлпия', 'kurmanxan.07@icloud.com', '77054495170', null, false, null, 'draft', '17.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0041', 'Құрманхан Ұлпия', 'ulpiakurmankhan@gmail.com', '77057161361', null, false, null, 'draft', '17.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0042', 'Айаруо', 'ajaru3668@gmail.com', '+77784469808', null, false, null, 'draft', '16.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0043', 'Азатова Зауре', 'erlan_uljan@mail.ru', '+77071523848', null, false, null, 'draft', '16.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0044', 'Гость подбора', null, '+77077880095', 'подбор', false, null, 'draft', '08.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"подбор","Подбор оплачен":"нет","Исходный статус":null}'::jsonb),
  ('OLD-2026-0045', 'Ryskeldi Abdunazarov', 'rusdaurenov@gmail.com', '+77077880094', 'заявка', false, 'Черновик', 'draft', '08.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0046', 'Халыкова Нурсила', 'halykova1991.03@icloud.com', '+77089654391', 'заявка', false, 'Черновик', 'draft', '01.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка","Подбор оплачен":"нет","Исходный статус":"Черновик"}'::jsonb),
  ('OLD-2026-0047', 'Булатова Асемгуль', 'alisa835539@gmail.com', '+77713883944', 'заявка, подбор', false, 'Оценена', 'draft', '01.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":"заявка, подбор","Подбор оплачен":"нет","Исходный статус":"Оценена"}'::jsonb),
  ('OLD-2026-0048', 'Участник (тест)', 'participant@qaz.test', null, null, false, null, 'draft', '01.07.2026', 'qaz-clients-2026-08-20.xlsx', '{"Потоки":null,"Подбор оплачен":"нет","Исходный статус":null}'::jsonb)
on conflict (source_key) do update
set
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  flow = excluded.flow,
  university_match_paid = excluded.university_match_paid,
  source_status = excluded.source_status,
  mapped_status = excluded.mapped_status,
  registered_on = excluded.registered_on,
  source_file = excluded.source_file,
  source_payload = excluded.source_payload,
  updated_at = now();

create or replace function public.link_legacy_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_phone text;
  user_email text;
  application_id uuid;
begin
  select public.normalize_contact_phone(p.phone)
    into user_phone
  from public.profiles p
  where p.id = p_user_id;

  select lower(nullif(trim(u.email), ''))
    into user_email
  from auth.users u
  where u.id = p_user_id;

  select a.id
    into application_id
  from public.applications a
  where a.user_id = p_user_id
  order by a.created_at desc
  limit 1;

  update public.legacy_applications l
  set
    linked_user_id = p_user_id,
    linked_application_id = coalesce(application_id, l.linked_application_id),
    updated_at = now()
  where (l.linked_user_id is null or l.linked_user_id = p_user_id)
    and (
      (coalesce(user_phone, '') <> '' and public.normalize_contact_phone(l.phone) = user_phone)
      or (coalesce(user_email, '') <> '' and lower(trim(coalesce(l.email, ''))) = user_email)
    );

  if application_id is not null then
    update public.legacy_applications
    set linked_application_id = application_id, updated_at = now()
    where linked_user_id = p_user_id
      and linked_application_id is distinct from application_id;
  end if;
end;
$$;

revoke all on function public.link_legacy_for_user(uuid) from public;

create or replace function public.link_legacy_after_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.link_legacy_for_user(new.id);
  return new;
end;
$$;

create or replace function public.link_legacy_after_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.link_legacy_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists legacy_link_on_profile on public.profiles;
create trigger legacy_link_on_profile
  after insert or update of phone on public.profiles
  for each row execute function public.link_legacy_after_profile_change();

drop trigger if exists legacy_link_on_application on public.applications;
create trigger legacy_link_on_application
  after insert on public.applications
  for each row execute function public.link_legacy_after_application_change();

-- Первая привязка к уже существующим аккаунтам по телефону или email.
do $$
declare
  user_row record;
begin
  for user_row in
    select u.id
    from auth.users u
    where exists (select 1 from public.profiles p where p.id = u.id)
  loop
    perform public.link_legacy_for_user(user_row.id);
  end loop;
end
$$;
