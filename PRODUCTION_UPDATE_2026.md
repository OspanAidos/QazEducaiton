# QazEducation — обновление production от 27.08.2026

Эта версия включает динамический Kaspi QR через ApiPay, реальные имя и фамилию
при регистрации, новую рабочую админ-панель и перенос 48 записей старого сайта.

## Что изменено

- Kaspi-счёт по номеру телефона заменён динамическим Kaspi QR;
- подтверждением оплаты считается только серверный статус ApiPay;
- заявка без подтверждённой оплаты остаётся в очереди «Ожидают оплату»;
- повторная отправка после доработки не требует нового платежа;
- при регистрации обязательны настоящие имя и фамилия;
- имя, фамилия и никнейм Telegram не используются как ФИО;
- админ-панель разделена на рабочие очереди;
- добавлены проверка документов, история заявки, платежей и действий;
- персональные документы скрыты от комиссии;
- WhatsApp изменён на `+7 775 080 8051`, «Горячая линия» удалена из футера;
- декоративные подписи над заголовками удалены;
- подготовлен импорт 48 записей из `qaz-clients-2026-08-20.xlsx`.

## Важно до публикации

1. Сделайте резервную копию production-базы Supabase.
2. Сделайте резервную копию действующей папки сайта на сервере.
3. Не добавляйте API-ключ ApiPay, секрет вебхука, `service_role` или Telegram
   Bot Token в `.env.local`, `dist` или исходный код.
4. Сначала примените SQL и опубликуйте Edge Functions, затем заменяйте `dist`.

## SQL для уже работающей базы

В Supabase Dashboard откройте `SQL Editor`. Выполняйте файлы по одному и
переходите к следующему только после сообщения `Success`:

1. `supabase/payments.sql`
2. `supabase/workflow-v5.sql`
3. `supabase/competition-results-v1.sql`
4. `supabase/admin-workspace-v1.sql`
5. `supabase/registration-identity-v1.sql`
6. `supabase/legacy-applications-v1.sql`

Скрипты идемпотентны. Последний файл создаёт защищённый реестр и импортирует
ровно 48 записей старого сайта:

- 2 записи получают статус «Ожидают оплату»;
- остальные сохраняются как черновики, потому что подтверждённой оплаты нет;
- исходный статус «Оценена» сохраняется в истории источника, но не считается
  решением нового конкурса без серверно подтверждённой оплаты;
- существующие аккаунты связываются по нормализованному телефону или email;
- записи без совпадения сохраняются и будут автоматически привязаны при
  последующей регистрации участника.

SQL не создаёт фиктивных пользователей и не записывает ложные платежи.

## Полный SQL-порядок для нового Supabase-проекта

1. `supabase/schema.sql`
2. `supabase/applications.sql`
3. `supabase/application-wizard.sql`
4. `supabase/payments.sql`
5. `supabase/telegram-auth.sql`
6. `supabase/telegram-bot-auth.sql`
7. `supabase/admin-panel.sql`
8. `supabase/commission-panel.sql`
9. `supabase/telegram-notifications.sql`
10. `supabase/workflow-v5.sql`
11. `supabase/appeals-v1.sql`
12. `supabase/competition-results-v1.sql`
13. `supabase/admin-workspace-v1.sql`
14. `supabase/registration-identity-v1.sql`
15. `supabase/legacy-applications-v1.sql`

## Настройка ApiPay и Kaspi QR

В ApiPay создайте API-ключ и секрет подписи вебхука. Адрес вебхука:

```text
https://PROJECT_REF.supabase.co/functions/v1/apipay-webhook
```

В Supabase Dashboard → Edge Functions → Secrets должны находиться:

```text
APIPAY_API_KEY=<API-ключ ApiPay>
APIPAY_WEBHOOK_SECRET=<секрет подписи>
APIPAY_BASE_URL=https://api.apipay.kz/api/v1
```

Опубликуйте функции из Terminal на Mac:

```bash
npx supabase functions deploy apipay-invoice
npx supabase functions deploy apipay-webhook
```

В ApiPay включите события по изменениям счёта. Статус `qr_scanned` является
промежуточным; оплата считается полученной только после финального статуса
`paid`.

## Публикация Telegram-функций

```bash
npx supabase functions deploy telegram-auth-start
npx supabase functions deploy telegram-auth-status
npx supabase functions deploy telegram-bot-webhook
npx supabase functions deploy telegram-notify
```

Секреты `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` должны оставаться в
Supabase Edge Function Secrets.

## Локальная проверка на MacBook

Установите Node.js LTS через зелёную кнопку `macOS Installer (.pkg)`, затем
закройте и снова откройте Terminal. На macOS используются команды `npm`, а не
`npm.cmd`.

```bash
cd /путь/к/QazEducation-production-2026-final
npm ci
cp .env.example .env.local
npm run dev
```

В `.env.local` укажите только публичные параметры Supabase:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Откройте адрес, показанный Vite, обычно `http://localhost:5173`. Готовую сборку
можно проверить отдельно:

```bash
npm run build
npm run preview -- --host 127.0.0.1
```

Обычно preview откроется на `http://localhost:4173`.

## Контрольная проверка

- регистрация не продолжается без имени и фамилии;
- после Telegram-входа в профиле остаётся введённое на сайте ФИО;
- на `/payment` создаётся QR, отображается срок действия и обновляется статус;
- неоплаченная заявка не попадает в «Поданные»;
- оплаченная и отправленная заявка появляется в рабочей очереди;
- доработка и отклонение требуют комментария;
- документы можно принять или запросить замену;
- комиссия не видит удостоверение личности и документы представителя;
- в админ-панели отображаются импортированные записи `OLD-2026-0001` —
  `OLD-2026-0048`;
- в футере нет «Горячей линии», WhatsApp — `+7 775 080 8051`;
- на русской и казахской версиях нет декоративных подписей над заголовками.

## Сборка и загрузка сайта

```bash
npm run build
tar -czf ~/Desktop/qazeducation-dist-2026-08-27.tar.gz -C dist .
scp ~/Desktop/qazeducation-dist-2026-08-27.tar.gz root@77.67.8.204:/tmp/
ssh root@77.67.8.204
```

На сервере сначала определите точный каталог сайта из конфигурации Nginx и
сделайте резервную копию. Затем распакуйте новую сборку во временную папку и
скопируйте её содержимое в каталог сайта. Не загружайте на сервер `src`,
`supabase`, `.env.local`, `node_modules` или серверные секреты.

После публикации проверьте:

```bash
curl -I https://qazeducation.kz/
curl -I https://qazeducation.kz/admin
curl -I https://qazeducation.kz/application
```

Во всех ответах ожидается HTTP `200`. Затем откройте сайт в браузере и выполните
жёсткое обновление: `Command + Shift + R`.

Юридические тексты и правила возврата перед публичным запуском должны быть
утверждены организатором и проверены юристом Республики Казахстан.
