import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth-context.jsx";
import { isSupabaseConfigured, supabase } from "../supabase.js";
import { Button } from "./ui.jsx";

const actionClass = "inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 py-3 font-medium text-on-accent transition-opacity disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";
const outlineClass = "inline-flex min-h-12 items-center justify-center rounded-full border border-accent px-6 py-3 font-medium text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";
const formatAmount = value => Number(value || 0).toLocaleString("ru-RU") + " ₸";

export default function PaymentCheckout({ lang = "ru", paymentType = "competition_fee", onPaymentConfirmed }) {
  const { user, refreshApplication } = useAuth();
  const competition = paymentType === "competition_fee";
  const kk = lang === "kk";
  const tr = (ru, kz) => kk ? kz : ru;
  const [payment, setPayment] = useState({ status: "loading" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const active = useRef(null);
  const requesting = useRef(false);
  const confirmed = useRef(null);
  const callbacks = useRef({ refreshApplication, onPaymentConfirmed });
  callbacks.current = { refreshApplication, onPaymentConfirmed };
  const identity = `${user?.id || ""}:${paymentType}`;
  const fallback = kk ? "Төлем мәртебесін тексеру мүмкін болмады. Қайта төлемей, кейінірек тексеріңіз." : "Не удалось проверить платёж. Не оплачивайте повторно — проверьте статус позже.";

  const request = useCallback(async action => {
    if (!user?.id || !isSupabaseConfigured || requesting.current) return null;
    const generation = active.current;
    requesting.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("apipay-invoice", {
        body: { action, payment_type: paymentType },
      });
      if (error || !data?.ok) {
        const detail = error?.context?.clone ? await error.context.clone().json().catch(() => null) : null;
        throw new Error(detail?.message || data?.message || fallback);
      }
      if (!generation || active.current !== generation) return null;
      setPayment(data);
      setMessage("");
      setNow(Date.now());
      if (data.status === "paid" && confirmed.current !== data.payment_id) {
        confirmed.current = data.payment_id;
        // Payment is already committed on the server; UI refresh cannot undo it.
        Promise.resolve(callbacks.current.refreshApplication?.()).catch(() => {});
        callbacks.current.onPaymentConfirmed?.(data);
      }
      return data;
    } catch (error) {
      if (generation && active.current === generation) {
        setMessage(error.message || fallback);
        setPayment(current => current.status === "loading" ? { status: "error" } : current);
      }
      return null;
    } finally {
      requesting.current = false;
      if (generation && active.current === generation) setBusy(false);
    }
  }, [user?.id, paymentType, fallback]);

  useEffect(() => {
    active.current = {};
    confirmed.current = null;
    setMessage("");
    setPayment({ status: !user ? "signed_out" : isSupabaseConfigured ? "loading" : "unconfigured" });
    // A sequential loop avoids overlapping requests, including slow mobile connections.
    let stopped = false;
    let timer;
    const poll = async () => {
      if (stopped) return;
      if (!document.hidden) await request("status");
      if (!stopped) timer = window.setTimeout(poll, 8000);
    };
    const focus = () => { if (!document.hidden) void request("status"); };
    if (user && isSupabaseConfigured) void poll();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      stopped = true;
      active.current = null;
      window.clearTimeout(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [identity, request]);

  useEffect(() => {
    if (payment.status !== "pending" || !payment.qr_expires_at) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [payment.status, payment.qr_expires_at]);

  const expiry = Date.parse(payment.qr_expires_at || "");
  const seconds = Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now) / 1000)) : null;
  const scanWindowEnded = seconds === 0;
  const scanned = payment.qr_substate === "scanned";
  const pending = payment.status === "pending";
  const review = ["refunded", "partially_refunded", "review_required"].includes(payment.status);
  const idle = ["none", "cancelled"].includes(payment.status);
  const amount = pending ? payment.amount : payment.amount_due;

  return (
    <article className="rounded-block border border-accent/40 bg-accent/5 p-7 lg:p-9" aria-busy={busy}>
      <h2 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-3xl">
        {competition ? tr("Участие в конкурсе и подбор вуза", "Конкурсқа қатысу және ЖОО таңдау") : tr("Подбор вуза", "ЖОО таңдау")}
      </h2>
      <p className="mt-2 text-ink-2">{tr("Оплата по Kaspi QR", "Kaspi QR арқылы төлеу")}</p>

      {payment.status === "signed_out" && <div className="mt-5">
        <p>{tr("Для оплаты войдите в личный кабинет участника.", "Төлем жасау үшін қатысушының жеке кабинетіне кіріңіз.")}</p>
        <Button to="/login" className="mt-5">{tr("Войти", "Кіру")}</Button>
      </div>}
      {payment.status === "unconfigured" && <p className="mt-5" role="alert">{tr("Подключение к серверу не настроено. Обратитесь в поддержку.", "Серверге қосылу реттелмеген. Қолдау қызметіне хабарласыңыз.")}</p>}
      {payment.status === "loading" && <p className="mt-5" role="status">{tr("Проверяем статус платежа…", "Төлем мәртебесін тексеріп жатырмыз…")}</p>}

      {(idle || pending) && <p className="mt-5 font-display text-3xl font-bold text-accent">{formatAmount(amount)}</p>}
      {competition && payment.credit_amount > 0 && payment.status !== "paid" && <p className="mt-3 max-w-[64ch] text-ink-2">
        {payment.topup_unavailable ? tr("Подбор вуза уже оплачен. Доплата 7 000 ₸ временно недоступна: для неё ещё не подключена отдельная позиция каталога. Не создавайте новый платёж; обратитесь в поддержку.", "ЖОО таңдау қызметі төленген. 7 000 ₸ қосымша төлем уақытша қолжетімсіз: ол үшін каталогтағы жеке позиция әлі қосылмаған. Жаңа төлем жасамаңыз; қолдау қызметіне хабарласыңыз.") : tr("Подбор вуза уже оплачен: 3 000 ₸ учтены в пакете за 10 000 ₸. Доплата за участие — 7 000 ₸.", "ЖОО таңдау қызметі төленген: 3 000 ₸ толық 10 000 ₸ пакетке есептелді. Қатысу үшін қосымша төлем — 7 000 ₸.")}
      </p>}
      {idle && <p className="mt-4 max-w-[65ch] leading-relaxed text-ink-2">
        {payment.status === "cancelled" ? tr("Предыдущий счёт закрыт платёжной системой. Если деньги уже списаны, сначала проверьте статус или обратитесь в поддержку.", "Алдыңғы шотты төлем жүйесі жапты. Ақша шегерілген болса, алдымен мәртебені тексеріңіз немесе қолдау қызметіне хабарласыңыз.") : tr("Создайте персональный QR и оплатите его в приложении Kaspi.kz. Подтверждение поступит напрямую от платёжной системы.", "Жеке QR жасап, оны Kaspi.kz қосымшасында төлеңіз. Растау төлем жүйесінен тікелей келеді.")}
      </p>}
      {idle && !payment.checkout_enabled && !payment.topup_unavailable && <p className="mt-4" role="status">{tr("Приём новых платежей пока настраивается.", "Жаңа төлемдерді қабылдау реттеліп жатыр.")}</p>}
      {idle && competition && <p className="mt-4 max-w-[65ch] text-ink-2">{tr("Перед созданием QR заполните заявку, загрузите обязательные документы и подтвердите согласия. После оплаты заполненная заявка будет подана автоматически.", "QR жасамас бұрын өтінімді толтырып, міндетті құжаттарды жүктеңіз және келісімдерді растаңыз. Төлемнен кейін толтырылған өтінім автоматты түрде жіберіледі.")}</p>}
      {payment.other_pending && payment.status !== "paid" && <p className="mt-4 text-ink" role="status">
        {tr("У вас есть незавершённый платёж другого пакета. Проверьте его перед новой оплатой.", "Басқа пакеттің аяқталмаған төлемі бар. Жаңа төлем алдында оны тексеріңіз.")}
        <Button to={payment.other_pending_type === "university_match" ? "/match" : "/payment"} variant="secondary" className="mt-4">{tr("Открыть платёж", "Төлемді ашу")}</Button>
      </p>}
      {idle && payment.checkout_enabled && !payment.other_pending && payment.status_checked !== false && <button type="button" disabled={busy} onClick={() => request("create")} className={`${actionClass} mt-6`}>
        {busy ? tr("Проверяем…", "Тексеріп жатырмыз…") : tr("Создать Kaspi QR", "Kaspi QR жасау")}
      </button>}

      {pending && <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(180px,260px)_1fr] sm:items-center">
        {!scanned && !scanWindowEnded && payment.qr_image_url && <div className="rounded-2xl bg-white p-4">
          <img src={payment.qr_image_url} alt="Kaspi QR" className="aspect-square w-full object-contain" />
        </div>}
        <div className={scanned || scanWindowEnded || !payment.qr_image_url ? "sm:col-span-2" : ""}>
          <p className="font-display text-xl font-bold" role="status">{scanned ? tr("Ожидаем подтверждение оплаты", "Төлем расталуын күтеміз") : payment.creation_pending ? tr("Проверяем создание QR", "QR жасалуын тексеріп жатырмыз") : scanWindowEnded ? tr("Проверяем итоговый статус счёта", "Шоттың соңғы мәртебесін тексеріп жатырмыз") : tr("Kaspi QR готов", "Kaspi QR дайын")}</p>
          <p className="mt-3 max-w-[66ch] leading-relaxed text-ink-2">{scanned ? tr("QR отсканирован. Завершите оплату в Kaspi.kz. Новый QR создавать не нужно.", "QR сканерленді. Kaspi.kz ішінде төлемді аяқтаңыз. Жаңа QR жасаудың қажеті жоқ.") : payment.creation_pending ? tr("Ответ платёжной системы ещё не получен. Не создавайте второй платёж: проверка продолжится автоматически. Если ожидание затянется, обратитесь в поддержку.", "Төлем жүйесінің жауабы әлі келген жоқ. Екінші төлем жасамаңыз: тексеру автоматты түрде жалғасады. Күту ұзаққа созылса, қолдау қызметіне хабарласыңыз.") : scanWindowEnded ? tr("Время сканирования истекло, но это не означает отмену платежа. Ждём подтверждение от платёжной системы; повторно не оплачивайте.", "Сканерлеу уақыты аяқталды, бірақ төлем жойылған жоқ. Төлем жүйесінің растауын күтеміз; қайта төлемеңіз.") : tr("Отсканируйте QR в приложении Kaspi.kz или откройте оплату на этом телефоне. После подтверждения статус обновится автоматически.", "QR кодын Kaspi.kz қосымшасында сканерлеңіз немесе төлемді осы телефонда ашыңыз. Растаудан кейін мәртебе автоматты түрде жаңарады.")}</p>
          {!scanned && !scanWindowEnded && seconds !== null && <p className="mt-4 text-sm text-ink-2">{tr("Время для сканирования", "Сканерлеу уақыты")}: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>}
          {!scanned && !scanWindowEnded && payment.qr_token_url && <a href={payment.qr_token_url} className={`${outlineClass} mt-5`}>{tr("Открыть в Kaspi.kz", "Kaspi.kz ішінде ашу")}</a>}
        </div>
      </div>}

      {payment.status === "paid" && <div className="mt-6 rounded-2xl border border-accent/40 bg-bg/70 p-5" role="status">
        <h3 className="font-display text-xl font-bold">{tr("Оплата подтверждена", "Төлем расталды")}</h3>
        <p className="mt-3 max-w-[68ch] leading-relaxed text-ink-2">{!competition ? tr("Подбор вуза доступен. Обновите страницу, чтобы продолжить.", "ЖОО таңдау қолжетімді. Жалғастыру үшін бетті жаңартыңыз.") : payment.submission?.submitted ? tr("Заявка подана автоматически. Подбор вуза и доступные разделы личного кабинета открыты. Обновите страницу, чтобы увидеть актуальные данные.", "Өтінім автоматты түрде жіберілді. ЖОО таңдау және жеке кабинеттің тиісті бөлімдері ашылды. Өзекті деректерді көру үшін бетті жаңартыңыз.") : tr("Платёж сохранён, подбор вуза открыт. Для подачи заявки нужно завершить заполнение или доработку. Повторная оплата не требуется.", "Төлем сақталды, ЖОО таңдау ашылды. Өтінімді жіберу үшін оны толтыруды немесе түзетуді аяқтаңыз. Қайта төлеудің қажеті жоқ.")}</p>
        {competition && !payment.submission?.submitted && <p className="mt-3 text-ink">{payment.submission?.reason === "application_missing" ? tr("Сначала создайте заявку в личном кабинете.", "Алдымен жеке кабинетте өтінім жасаңыз.") : payment.submission?.reason}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className={actionClass} onClick={() => window.location.reload()}>{tr("Обновить страницу", "Бетті жаңарту")}</button>
          <Button to={competition ? "/application" : "/match"} variant="secondary">{competition ? tr("Открыть заявку", "Өтінімді ашу") : tr("Перейти к подбору вуза", "ЖОО таңдауға өту")}</Button>
        </div>
      </div>}
      {review && <p className="mt-5 max-w-[66ch]" role="status">{tr("Платёж требует сверки. Не оплачивайте повторно; обратитесь в поддержку. История платежа сохранена.", "Төлемді салыстырып тексеру қажет. Қайта төлемеңіз; қолдау қызметіне хабарласыңыз. Төлем тарихы сақталған.")}</p>}
      {payment.status_checked === false && <p className="mt-4 text-ink-2" role="status">{tr("Платёжная система временно не отвечает. Показаны последние сохранённые данные; проверка продолжается.", "Төлем жүйесі уақытша жауап бермейді. Соңғы сақталған деректер көрсетілген; тексеру жалғасады.")}</p>}
      {message && <p className="mt-4 text-ink" role="alert">{message}</p>}
      {user && competition && idle && <Button to="/application" variant="secondary" className="mt-5 mr-3">{tr("Вернуться к заявке", "Өтінімге оралу")}</Button>}
      {user && isSupabaseConfigured && payment.status !== "loading" && <button type="button" disabled={busy} onClick={() => request("status")} className={`${outlineClass} mt-5 disabled:opacity-50`}>{busy ? tr("Проверяем…", "Тексеріп жатырмыз…") : tr("Проверить статус", "Мәртебені тексеру")}</button>}
    </article>
  );
}
