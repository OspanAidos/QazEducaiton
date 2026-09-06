import { useEffect, useState } from "react";
import { amoAdminAction } from "../amocrm-sync.js";

function formatDate(value) {
  if (!value) return "Ещё не выполнялась";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AmoCrmPanel({ onToast, onError }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshInfo = async ({ announce = false } = {}) => {
    const next = await amoAdminAction("connection");
    setInfo(next);
    if (announce) onToast?.("Соединение с amoCRM работает.");
    return next;
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    amoAdminAction("connection")
      .then((next) => {
        if (active) setInfo(next);
      })
      .catch((error) => {
        if (active) onError?.(error.message || "Не удалось проверить amoCRM");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [onError]);

  const run = async (action, payload, successMessage) => {
    setBusy(true);
    onError?.("");
    try {
      const result = await amoAdminAction(action, payload);
      const failed = (result?.results || []).filter((item) => item?.ok === false);
      await refreshInfo();
      if (failed.length) {
        throw new Error(`Не обработано заявок: ${failed.length}. Ошибка сохранена для повторной попытки.`);
      }
      onToast?.(typeof successMessage === "function" ? successMessage(result) : successMessage);
      return result;
    } catch (error) {
      onError?.(error.message || "Ошибка amoCRM");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const automatic = Boolean(info?.enabled && info?.auto_sync?.active);
  const stateLabel = loading
    ? "Проверяем подключение…"
    : automatic
      ? "Автоматическая синхронизация работает"
      : info?.enabled
        ? "Фоновая обработка не настроена"
        : "Синхронизация выключена";

  return (
    <div className="mt-7 rounded-block border border-line bg-bg-2 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl font-bold text-ink">amoCRM · QAZEDUCATION</h3>
          <p className="mt-2 max-w-[76ch] text-sm leading-relaxed text-muted">
            Новые регистрации, оплаты и изменения статусов передаются автоматически.
            Одна заявка всегда обновляет одну сделку по неизменяемому UUID.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${
          automatic ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"
        }`}>
          {stateLabel}
        </span>
      </div>

      {!loading && !automatic && (
        <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          Мгновенная отправка может работать, но очередь пока не обрабатывается автоматически.
          Завершите установку фоновой задачи в Supabase.
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Аккаунт" value={info?.account?.name || info?.account?.subdomain || (loading ? "Проверяем…" : "—")} />
        <Stat label="Связано сделок" value={info?.stats?.linked ?? "—"} />
        <Stat label="Ожидают отправки" value={info?.stats?.pending ?? "—"} />
        <Stat label="Ошибки" value={info?.stats?.failed ?? "—"} tone={Number(info?.stats?.failed || 0) > 0 ? "danger" : "default"} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>Последняя успешная синхронизация: {formatDate(info?.stats?.last_synced_at)}</span>
        {Number(info?.stats?.failed || 0) > 0 && (
          <button
            type="button"
            disabled={busy || !info?.enabled}
            onClick={() => run("retry_failed", { limit: 10 }, (result) => `Повторно обработано заявок: ${result?.processed || 0}.`)}
            className="rounded-full bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Повторить ошибки
          </button>
        )}
      </div>

      {info?.stats?.last_error && (
        <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          Последняя ошибка: {info.stats.last_error}
        </p>
      )}

      <details className="mt-7 border-t border-line pt-5">
        <summary className="cursor-pointer select-none text-sm font-semibold text-ink">
          Техническая информация
        </summary>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onError?.("");
              refreshInfo({ announce: true })
                .catch((error) => onError?.(error.message || "Ошибка amoCRM"))
                .finally(() => setBusy(false));
            }}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            Проверить сейчас
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => run("setup", {}, "Поля и защищённая маршрутизация проверены.")}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            Повторно подготовить поля
          </button>
          <button
            type="button"
            disabled={busy || !info?.config || !info?.enabled}
            onClick={() => run("drain", { limit: 1 }, (result) => result?.processed
              ? "Одна заявка обработана вручную."
              : "Очередь пуста.")}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            Обработать 1 заявку вручную
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Stat label="Фоновая задача" value={info?.auto_sync?.active ? "Активна · каждую минуту" : "Не активна"} />
          <Stat label="Последний запуск Cron" value={formatDate(info?.auto_sync?.last_run_at)} />
        </div>

      </details>
    </div>
  );
}

function Stat({ label, value, tone = "default" }) {
  return (
    <div className={`rounded-2xl border bg-bg p-4 ${tone === "danger" ? "border-red-500/40" : "border-line"}`}>
      <p className="text-xs uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${tone === "danger" ? "text-red-700" : "text-ink"}`}>{value}</p>
    </div>
  );
}
