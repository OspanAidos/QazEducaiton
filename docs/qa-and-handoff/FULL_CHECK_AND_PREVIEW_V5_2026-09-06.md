# QazEducation — полный QA и безопасный preview, v5

Дата проверки: 6 сентября 2026 года.

Эта версия подготовлена поверх единого релиза сертификатов v4. Она ничего не
публикует и сама не изменяет рабочий Supabase. Все новые серверные изменения
собраны в отдельной идемпотентной миграции `supabase/qa-hardening-v5.sql`.

## Итог проверки

- 57 автоматических тестов проходят локально;
- production-сборка Vite успешна: 5 097 модулей;
- отдельная preview-сборка успешна;
- preview со ссылкой на рабочий проект `fdoduxdwkgnldrzzxovu` намеренно
  блокируется ещё до сборки;
- preview получает мета-тег `noindex,nofollow,noarchive`;
- `npm audit --offline` не обнаружил известных уязвимостей;
- подпись, печать и закрытые шрифты отсутствуют в `public` и `dist`;
- SQL усиления повторно выполняется в изолированной PostgreSQL-базе;
- существующие проверки ApiPay, amoCRM, сертификатов, Telegram-очереди,
  конкурса и апелляций сохранены.

## Исправлено в v5

1. Автосохранение заявки теперь объединяет быстрые изменения, выполняет
   запросы последовательно и не теряет данные после временной ошибки сети.
2. Preview нельзя случайно собрать с рабочим Supabase. URL, публичный ключ и
   ожидаемый project ref проверяются одновременно.
3. Ссылки в Telegram берутся из серверного `SITE_ORIGIN`; preview больше не
   отправляет пользователя на основной сайт.
4. Адрес фонового amoCRM worker больше не зашит в SQL: project ref передаётся
   явно при установке задачи.
5. Номер заявки назначается базой. Браузер не может подменить номер, статус,
   решение, платёж или Telegram-идентификатор.
6. Поля черновика сохраняются атомарной RPC-функцией с белым списком ключей.
7. Правила сайта, юридические тексты и настройки цикла приведены к одному
   варианту: 14–25 лет, граждане Казахстана и иностранные участники,
   планирующие обучение в Казахстане. Перед production это правило должен
   письменно подтвердить руководитель и юрист.

## Что уже подтверждено на рабочем контуре

- реальная оплата 10 000 ₸ тестовым аккаунтом прошла через ApiPay;
- заполненная заявка подалась автоматически;
- сертификат участника создался один раз;
- повторная синхронизация не создала дубль и не отправила второе уведомление;
- Telegram-очередь отчиталась об успешной отправке;
- публичная проверка токена показала действительный сертификат;
- private bucket содержит пять серверных ресурсов сертификата;
- `certificate-file` и `telegram-notify` имеют статус `ACTIVE`;
- в админ-панели отображается квота 30 стипендий.

Остаются ручные проверки: фактическое сообщение на телефоне, скачивание PDF и
PNG владельцем, отказ в скачивании чужому аккаунту, визуальная верстка четырёх
сертификатов, сканирование QR из файла и полный цикл апелляции. Они выполняются
в отдельном preview-контуре, а не в рабочем цикле 2026.

## 1. Создать отдельный Supabase для preview

Создайте новый проект без копирования пользователей и секретов production.
Запишите его `PROJECT_REF`, URL и publishable key. Не используйте рабочий ref
`fdoduxdwkgnldrzzxovu`.

В SQL Editor нового проекта выполняйте по одному файлу и переходите дальше
только после `Success`:

1. `supabase/schema.sql`
2. `supabase/applications.sql`
3. `supabase/application-wizard.sql`
4. `supabase/payments.sql`
5. `supabase/telegram-auth.sql`
6. `supabase/telegram-bot-auth.sql`
7. `supabase/telegram-bot-code-login-migration.sql`
8. `supabase/admin-panel.sql`
9. `supabase/commission-panel.sql`
10. `supabase/telegram-notifications.sql`
11. `supabase/workflow-v5.sql`
12. `supabase/appeals-v1.sql`
13. `supabase/competition-results-v1.sql`
14. `supabase/admin-workspace-v1.sql`
15. `supabase/registration-identity-v1.sql`
16. `supabase/qr-payments-v2.sql`
17. `supabase/catalog-qr-v3.sql`
18. `supabase/amocrm-integration-v2.sql`
19. `supabase/certificates-server-v2.sql`
20. `supabase/qa-hardening-v5.sql`

Не выполняйте в preview `legacy-applications-v1.sql`: он предназначен для
переноса старых рабочих записей. Не устанавливайте `amocrm-auto-sync-v3.sql`,
пока preview сознательно не подключён к отдельной тестовой воронке amoCRM.

## 2. Закрытые ресурсы сертификатов

В bucket `qazeducation-certificates-private` создайте папку `assets` и
загрузите только:

```text
logo-mark.png
signature-seal.png
DejaVuSans.ttf
DejaVuSans-Bold.ttf
DejaVuSerif.ttf
```

Bucket должен остаться `Private`. Папку `private-install-assets` нельзя
загружать на веб-хостинг.

## 3. Безопасные переменные preview

Скопируйте `.env.preview.example` в `.env.preview.local` и заполните:

```text
VITE_APP_ENV=preview
VITE_SITE_ORIGIN=https://preview.qazeducation.kz
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=ПУБЛИЧНЫЙ_КЛЮЧ_PREVIEW
VITE_EXPECTED_SUPABASE_PROJECT_REF=PROJECT_REF
```

В Edge Function Secrets нового проекта установите:

```text
SITE_ORIGIN=https://preview.qazeducation.kz
CERTIFICATE_VERIFY_BASE_URL=https://preview.qazeducation.kz/certificate
APIPAY_PAYMENTS_ENABLED=false
AMO_SYNC_ENABLED=false
```

Не переносите ключ ApiPay, токен amoCRM, Telegram Bot Token, service role или
секреты webhook из production. Для проверки входа и сообщений нужен отдельный
тестовый Telegram-бот со своим webhook на preview-проект.

## 4. Развернуть функции preview

Из корня проекта, подставив новый `PROJECT_REF`:

```bash
npx supabase functions deploy telegram-auth-start --project-ref PROJECT_REF --use-api
npx supabase functions deploy telegram-auth-status --project-ref PROJECT_REF --use-api
npx supabase functions deploy telegram-bot-webhook --project-ref PROJECT_REF --use-api
npx supabase functions deploy telegram-notify --project-ref PROJECT_REF --use-api
npx supabase functions deploy apipay-invoice --project-ref PROJECT_REF --use-api
npx supabase functions deploy apipay-webhook --project-ref PROJECT_REF --use-api
npx supabase functions deploy amocrm-sync --project-ref PROJECT_REF --use-api
npx supabase functions deploy certificate-file --project-ref PROJECT_REF --use-api
```

`certificate-file`, `apipay-invoice` и `amocrm-sync` должны сохранять проверку
JWT. Публичные webhook и старт Telegram сами проверяют собственные секреты.

## 5. Создать служебные роли

В Authentication создайте отдельные preview-аккаунты администратора и члена
комиссии, затем добавьте их UUID:

```sql
insert into public.admin_users(user_id)
values ('UUID_PREVIEW_ADMIN')
on conflict (user_id) do nothing;

insert into public.commission_members(user_id, display_name, active)
values ('UUID_PREVIEW_COMMISSION', 'Тестовый эксперт', true)
on conflict (user_id) do update
set display_name = excluded.display_name,
    active = true;
```

Участника регистрируйте через отдельный preview Telegram-бот. Не используйте
номер реального участника.

## 6. Собрать и закрыть preview

```bash
npm ci
npm run test
npm run build:preview
```

На `preview.qazeducation.kz` публикуйте только содержимое `dist`. Передавать
ссылку руководителю можно только после включения парольной защиты на уровне
хостинга или Cloudflare Access. Проверка по мета-тегу `noindex` не заменяет
пароль.

## 7. Полный ручной сценарий

| № | Роль | Проверка | Ожидаемый результат |
|---:|---|---|---|
| 1 | Гость | RU/KZ, меню, документы, мобильный вид | Нет обрезки, пустых блоков и неверных ссылок |
| 2 | Участник | Регистрация через тестовый Telegram | Один аккаунт, настоящее ФИО, одна заявка |
| 3 | Участник | Быстро изменить несколько полей и обновить страницу | Все последние значения сохранены |
| 4 | Участник | Возраст 13/26, неполные документы, нет согласий | Подача и оплата заблокированы с понятной причиной |
| 5 | Участник | Иностранец без ЕНТ, но с документом об успеваемости | Заявка допустима; ЕНТ указан как необязательный |
| 6 | Участник | Выбор медицины/ветеринарии для гранта | Грантовый трек заблокирован |
| 7 | Оплата | ApiPay выключен в preview | Реальный QR не создаётся и деньги не списываются |
| 8 | Админ | Доработка, повторная подача, отклонение | Комментарий обязателен; второй платёж не требуется |
| 9 | Комиссия | Доступ к заявке и оценивание | Личные документы скрыты; чужие оценки не видны |
| 10 | Админ | Рейтинг, ничья на границе, квоты | Ничья блокирует публикацию; 10/30/Top-30 соблюдены |
| 11 | Участник | Апелляция и повторное решение | Срок 3 рабочих дня; история не теряется |
| 12 | Сертификат | Повторная выдача | Один активный сертификат каждого типа |
| 13 | Сертификат | PDF, PNG, QR, чужой аккаунт | Владелец скачивает; чужой получает отказ; QR валиден |
| 14 | Telegram | Все переходы статусов | Одно актуальное сообщение, ссылка ведёт в preview |
| 15 | amoCRM | Интеграция выключена | Ни одна рабочая сделка не создаётся и не меняется |
| 16 | Безопасность | Открыть `/admin`, `/commission`, чужие файлы | Неавторизованный доступ отклонён |

Для проверки разных этапов используйте только тестовые записи отдельного
проекта. Реальные оплаты в preview не нужны: настоящая цепочка ApiPay на 10 000 ₸
уже подтверждена рабочим тестовым аккаунтом.

## 8. Условия допуска к production

Публиковать v5 на основной сайт можно только когда одновременно выполнено:

- руководитель подтвердил тексты, квоты и допуск иностранных участников;
- юрист подтвердил правила, оферту, персональные данные и возвраты;
- все 16 ручных сценариев отмечены как пройденные;
- PDF/PNG/QR проверены с телефона и второго аккаунта;
- сделаны резервные копии сайта и базы;
- `qa-hardening-v5.sql` сначала применён и проверен;
- `SITE_ORIGIN=https://qazeducation.kz` установлен для Telegram;
- новая production-сборка создана только с рабочим `.env.local`;
- предусмотрен откат без удаления платежей, заявок и сертификатов.

Нельзя обещать математическое отсутствие любых будущих ошибок, но этот порядок
закрывает найденные дефекты и не допускает публикацию до полноценного
изолированного приёмочного теста.
