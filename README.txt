QazEducation amoCRM fixed routing v2.2

Маршрутизация этапов зафиксирована на сервере.
Произвольный выбор колонок администратором запрещён.

Установка из ~/Downloads:

unzip -o QazEducation-amocrm-fixed-routing-v2.2.zip \
  -d QazEducation-production-2026-final

cd ~/Downloads/QazEducation-production-2026-final

npx supabase functions deploy amocrm-sync \
  --project-ref fdoduxdwkgnldrzzxovu \
  --use-api

После развёртывания обновить localhost через Cmd+Shift+R и нажать
«Подготовить поля». AMO_SYNC_ENABLED оставить false до теста.
