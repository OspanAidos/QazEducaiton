# Закрытые ресурсы сертификатов

Эта папка нужна только для установки серверного генератора. Она не должна
попадать в `public/`, `dist/`, публичный Git-репозиторий или на обычный
веб-хостинг.

После выполнения `supabase/certificates-server-v2.sql` загрузите в закрытый
bucket `qazeducation-certificates-private`, в папку `assets`, следующие файлы:

- `logo-mark.png`
- `signature-seal.png`
- `DejaVuSans.ttf`
- `DejaVuSans-Bold.ttf`
- `DejaVuSerif.ttf`

Итоговые пути в Supabase Storage должны быть:

- `assets/logo-mark.png`
- `assets/signature-seal.png`
- `assets/DejaVuSans.ttf`
- `assets/DejaVuSans-Bold.ttf`
- `assets/DejaVuSerif.ttf`

Bucket обязан оставаться **Private**. Отдельных исходников подписи и печати в
комплекте нет: они уже объединены в один PNG.
