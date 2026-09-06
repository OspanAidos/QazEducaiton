# Интеграция QazEducation ↔ amoCRM — установка и настройка

Модель: **одна заявка на сайте = одна сделка в amoCRM**. Сделка создаётся
один раз (при первой подаче, статус `submitted`), дальше при каждой смене
статуса та же сделка обновляется. Новые сделки не плодятся.

Архитектура: `смена статуса → триггер БД → очередь crm_sync_queue →
Edge Function amocrm-sync → amoCRM API`. OAuth-токены и секреты живут
только на бэкенде (Supabase), фронтенд их не видит.

---

## Шаг 1. SQL-миграция

Supabase → SQL Editor → выполнить целиком `supabase/amocrm-integration.sql`.
Создаёт таблицы `application_crm_links`, `crm_sync_queue`,
`amocrm_oauth_tokens`, `crm_status_map`, триггер на `applications` и
функцию `crm_requeue_application`.

## Шаг 2. Секреты Supabase (Edge Function Secrets)

Из настроек твоей интеграции в amoCRM возьми значения и задай:

    supabase secrets set AMO_CLIENT_ID=<Integration ID>
    supabase secrets set AMO_CLIENT_SECRET=<Secret Key>
    supabase secrets set AMO_REDIRECT_URI=<Redirect URI из настроек интеграции>
    supabase secrets set AMO_BASE_URL=https://<твой-аккаунт>.amocrm.ru

Не клади их в `VITE_*`, в Git и в console.log. `SUPABASE_URL` и
`SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет функциям сам.

## Шаг 3. Деплой функций

    supabase functions deploy amocrm-auth --no-verify-jwt
    supabase functions deploy amocrm-sync --no-verify-jwt

## Шаг 4. Первичная авторизация OAuth (authorization_code)

Authorization Code живёт ~20 минут — используй сразу. В настройках
интеграции amoCRM нажми «Получить код авторизации», затем:

    curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/amocrm-auth" \
      -H "Content-Type: application/json" \
      -d '{"action":"exchange","code":"<AUTHORIZATION_CODE>"}'

Ответ `{"ok":true,"message":"amoCRM authorized"}` — токены сохранены в
`amocrm_oauth_tokens`. Дальше функция сама рефрешит их по мере необходимости
(включая ротацию refresh_token).

Проверить авторизацию: `{"action":"status"}` → `{"authorized":true}`.

## Шаг 5. Получить реальные pipeline_id / status_id

    curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/amocrm-auth" \
      -H "Content-Type: application/json" -d '{"action":"pipelines"}'

В ответе — воронки и их статусы с реальными `id`. Выбери воронку под
заявки QazEducation и сопоставь статусы сайта со статусами воронки.

## Шаг 6. Заполнить маппинг статусов

Для каждого статуса сайта пропиши id из шага 5 (SQL Editor). Пример:

    update public.crm_status_map set
      amo_pipeline_id = <PIPELINE_ID>, amo_status_id = <STATUS_ID>, amo_status_name = 'Новый'
    where site_status = 'submitted';

Повтори для: tech_review, needs_fixes, accepted, evaluation, final,
rejected, result, appeal, contract. Если для какого-то статуса маппинга нет,
сделка всё равно обновится, но останется в текущем статусе воронки.

Итоговая таблица (site_status → amo_pipeline_id, amo_status_id,
amo_status_name) — это и есть требуемый mapping.

## Шаг 7. Проверка сценариев

Все прогоняются на твоей стороне (у меня нет доступа к твоей amoCRM):

1. Новая заявка подаётся (submitted) → в amoCRM 1 сделка, `amo_lead_id`
   записан в `application_crm_links`.
2. submitted → tech_review (админом) → та же сделка сменила статус, новой нет.
3. tech_review → needs_fixes → та же сделка.
4. needs_fixes → submitted → та же сделка.
5. Повторный вызов amocrm-sync → новой сделки нет (идемпотентность).
6. amoCRM недоступен → заявка на сайте цела, событие в crm_sync_queue
   со `status='error'`, повторится при следующем изменении или кнопкой.
7. access_token истёк → рефреш прошёл автоматически, новые токены сохранены.
8. Два одновременных sync → одна сделка (UNIQUE + anti-race в коде).
9. rejected → та же сделка в статус «Отказ».
10. result / appeal / contract → та же сделка.

Проверять связь можно так:

    select application_id, amo_lead_id, last_synced_status, sync_status, last_error
    from application_crm_links order by updated_at desc;

    select * from crm_sync_queue order by created_at desc limit 20;

---

## Что происходит при ошибке amoCRM

Заявка на сайте не ломается. Событие в `crm_sync_queue` получает
`status='error'` и `last_error`. `attempts` растёт. Пока `attempts < 5`,
событие подхватывается при следующем прогоне очереди (следующая смена
статуса любой заявки, либо ручная кнопка). После 5 попыток — перестаёт,
чтобы не долбить вечно; можно перезапустить вручную.

## Как перезапустить синхронизацию вручную

- Из админки: кнопка «Повторить синхронизацию с amoCRM» у заявки
  (вызывает `crm_requeue_application` + amocrm-sync).
- Вручную: `select crm_requeue_application('<APPLICATION_UUID>');`
  затем дёрнуть функцию amocrm-sync.

## Защита от дублей

Три уровня: (1) UNIQUE `(provider, application_id)` и
`(provider, amo_lead_id)` в БД; (2) проверка `amo_lead_id` перед созданием —
если он есть, только UPDATE; (3) запись `amo_lead_id` условием
`is amo_lead_id null` (anti-race: параллельный второй вызов не перезапишет).

## Автоматический retry по таймеру (опционально, на будущее)

Сейчас retry — при следующем событии или вручную (без cron, как ты просил).
Если захочешь полностью автоматический повтор, добавь pg_cron:

    select cron.schedule('amocrm-drain', '*/5 * * * *',
      $$ select net.http_post(
        url := 'https://<PROJECT_REF>.supabase.co/functions/v1/amocrm-sync',
        headers := '{"Content-Type":"application/json"}', body := '{}') $$);

(требует расширений pg_cron и pg_net).

## Возможные проблемы в production

- Забыт `--no-verify-jwt` при деплое → функции отклоняют вызовы (401).
- Не заполнен crm_status_map → сделки создаются/обновляются, но статус
  воронки не меняется. Проверь шаг 6.
- Протух authorization_code на шаге 4 → возьми новый в amoCRM.
- Кастомное поле под номер заявки: сейчас номер идёт в название сделки
  («Заявка QE-000123 — Имя»). Если нужно отдельное поле в amoCRM для
  `application_number`, заведи его в amoCRM и скажи — добавлю запись в него.
