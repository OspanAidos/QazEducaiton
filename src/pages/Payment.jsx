import { useEffect, useMemo, useState } from "react";
import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import { useAuth } from "../auth-context.jsx";
import { supabase } from "../supabase.js";
import Reveal from "../components/Reveal.jsx";
import { Notice, PageHead, Section, SectionTitle } from "../components/page-blocks.jsx";
import { Button } from "../components/ui.jsx";

export default function Payment() {
  const lang = useLang();
  const p = pages[lang].payment;

  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        <PaymentCheckout lang={lang} />

        <Reveal>
          <div className="mt-16"><SectionTitle>{p.methodsTitle}</SectionTitle></div>
        </Reveal>

        <div className="mt-12 grid gap-4 lg:max-w-[760px] lg:gap-6">
          {p.methods.map((method, index) => (
            <Reveal key={method.name} delay={index * 0.06}>
              <article className="h-full rounded-block border border-line bg-bg-2 p-7 lg:p-9">
                <span className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.08em] text-muted">
                  {method.status}
                </span>
                <h3 className="mt-6 font-display text-2xl font-bold tracking-tight">{method.name}</h3>
                <p className="mt-3 max-w-[44ch] text-base leading-relaxed text-ink-2">{method.text}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.08}>
          <article className="mt-6 rounded-block border border-accent/40 bg-accent/5 p-7 lg:p-9">
            <h3 className="font-display text-2xl font-bold tracking-tight text-ink">
              {lang === "kk" ? "ЖОО таңдау қызметі төлемге енгізілген" : "Подбор вуза включён в участие"}
            </h3>
            <p className="mt-3 max-w-[70ch] text-base leading-relaxed text-ink-2">
              {lang === "kk"
                ? "QazEducation конкурсына қатысу үшін 10 000 ₸ ұйымдастыру төлемін төлеген кезде 3 000 ₸ тұратын ЖОО таңдау қызметі қосымша төлемсіз беріледі."
                : "При оплате организационного платежа 10 000 ₸ за участие в конкурсе QazEducation услуга «Подбор вуза» стоимостью 3 000 ₸ предоставляется без дополнительной оплаты."}
            </p>
          </article>
        </Reveal>
      </Section>

      <Section className="border-t border-line">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5"><SectionTitle>{p.refundTitle}</SectionTitle></Reveal>
          <Reveal delay={0.06} className="lg:col-span-7">
            <p className="max-w-[60ch] text-base leading-relaxed text-ink-2 lg:text-lg">{p.refundText}</p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:gap-6">
          {p.notices.map((notice, index) => (
            <Reveal key={notice.title} delay={index * 0.06}>
              <Notice id={index === 0 ? "payment" : "status"} {...notice} className="h-full" />
            </Reveal>
          ))}
        </div>
      </Section>
    </>
  );
}

function PaymentCheckout({ lang }) {
  const { user, refreshApplication } = useAuth();
  const [payment, setPayment] = useState({ status: user ? "loading" : "signed_out" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const copy = lang === "kk"
    ? {
        title: "Kaspi QR арқылы төлеу",
        signedOut: "Төлем жасау үшін қатысушының жеке кабинетіне кіріңіз.",
        login: "Жеке кабинетке кіру",
        loading: "Төлем мәртебесі тексерілуде…",
        idle: "10 000 ₸ сомасына жеке Kaspi QR жасаңыз және оны Kaspi.kz қосымшасымен сканерлеңіз.",
        create: "Kaspi QR жасау",
        retry: "Жаңа QR жасау",
        pendingTitle: "Kaspi QR дайын",
        pending: "QR-кодты Kaspi.kz қосымшасымен сканерлеңіз. Төлем расталғаннан кейін мәртебе автоматты түрде жаңарады.",
        scannedTitle: "Төлем расталуын күтеміз",
        scanned: "QR сканерленді. Kaspi.kz қосымшасында төлемді аяқтаңыз — жаңа QR жасаудың қажеті жоқ.",
        openKaspi: "Kaspi.kz қосымшасында ашу",
        expires: "QR жарамдылық мерзімі",
        expired: "QR мерзімі аяқталды. Төлем жасау үшін жаңасын жасаңыз.",
        paidTitle: "Төлем расталды",
        paid: "Ұйымдастыру төлемі алынды. Енді өтінімді қарауға жіберуге болады.",
        toApplication: "Өтінімге оралу",
        error: "Kaspi QR жасау мүмкін болмады. Кейінірек қайталап көріңіз.",
      }
    : {
        title: "Оплата по Kaspi QR",
        signedOut: "Для оплаты войдите в личный кабинет участника.",
        login: "Войти в личный кабинет",
        loading: "Проверяем статус платежа…",
        idle: "Создайте персональный Kaspi QR на 10 000 ₸ и отсканируйте его в приложении Kaspi.kz.",
        create: "Создать Kaspi QR",
        retry: "Создать новый QR",
        pendingTitle: "Kaspi QR готов",
        pending: "Отсканируйте QR-код в приложении Kaspi.kz. После подтверждения оплаты статус обновится автоматически.",
        scannedTitle: "Ожидаем подтверждение оплаты",
        scanned: "QR отсканирован. Завершите платёж в приложении Kaspi.kz — создавать новый QR не нужно.",
        openKaspi: "Открыть в приложении Kaspi.kz",
        expires: "QR действует ещё",
        expired: "Срок действия QR истёк. Создайте новый код для оплаты.",
        paidTitle: "Оплата подтверждена",
        paid: "Организационный платёж получен. Теперь заявку можно отправить на рассмотрение.",
        toApplication: "Вернуться к заявке",
        error: "Не удалось создать Kaspi QR. Попробуйте позже.",
      };

  const expiresAt = payment.qr_expires_at
    ? new Date(payment.qr_expires_at).getTime()
    : null;
  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;
  const expiredLocally = payment.status === "pending" && secondsLeft === 0;
  const scanned = payment.qr_substate === "scanned";
  const countdown = useMemo(() => {
    if (secondsLeft === null) return "";
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = String(secondsLeft % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  const request = async (action) => {
    const { data, error } = await supabase.functions.invoke("apipay-invoice", {
      body: { action, payment_type: "competition_fee" },
    });

    if (error || data?.ok === false) {
      throw new Error(data?.message || error?.message || copy.error);
    }

    setPayment(data || { status: "none" });
    if (data?.status === "paid") await refreshApplication();
    return data;
  };

  useEffect(() => {
    if (!user) {
      setPayment({ status: "signed_out" });
      return undefined;
    }

    let active = true;
    setPayment({ status: "loading" });
    request("status").catch((error) => {
      if (!active) return;
      setMessage(error.message || copy.error);
      setPayment({ status: "error" });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || payment.status !== "pending") return undefined;
    const interval = window.setInterval(() => {
      setNow(Date.now());
      request("status").catch(() => {});
    }, 3000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, payment.status, payment.invoice_id]);

  useEffect(() => {
    if (payment.status !== "pending" || !expiresAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [payment.status, expiresAt]);

  const createQr = async () => {
    setBusy(true);
    setMessage("");
    try {
      await request("create");
      setNow(Date.now());
    } catch (error) {
      setMessage(error.message || copy.error);
      setPayment({ status: "error" });
    } finally {
      setBusy(false);
    }
  };

  const idleStatuses = ["none", "cancelled", "refunded", "error"];

  return (
    <Reveal>
      <article className="rounded-block border border-accent/40 bg-accent/5 p-7 lg:p-9">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink lg:text-3xl">{copy.title}</h2>

        {payment.status === "signed_out" && (
          <>
            <p className="mt-4 max-w-[60ch] leading-relaxed text-ink-2">{copy.signedOut}</p>
            <Button to="/login" className="mt-6">{copy.login}</Button>
          </>
        )}

        {payment.status === "loading" && <p className="mt-4 text-ink-2" role="status">{copy.loading}</p>}

        {idleStatuses.includes(payment.status) && user && (
          <>
            <p className="mt-4 max-w-[60ch] leading-relaxed text-ink-2">{message || (payment.status === "cancelled" ? copy.expired : copy.idle)}</p>
            <button
              type="button"
              onClick={createQr}
              disabled={busy}
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-medium text-on-accent transition-opacity disabled:opacity-50"
            >
              {busy ? copy.loading : payment.status === "none" ? copy.create : copy.retry}
            </button>
          </>
        )}

        {payment.status === "pending" && !expiredLocally && (
          <div className="mt-6 grid items-center gap-7 lg:grid-cols-[minmax(220px,300px)_1fr]">
            {!scanned && payment.qr_image_url && (
              <div className="overflow-hidden rounded-3xl border border-line bg-white p-4">
                <img src={payment.qr_image_url} alt="Kaspi QR" className="mx-auto aspect-square w-full object-contain" />
              </div>
            )}
            <div role="status" className={scanned ? "lg:col-span-2" : ""}>
              <p className="font-display text-xl font-bold text-ink">{scanned ? copy.scannedTitle : copy.pendingTitle}</p>
              <p className="mt-3 max-w-[62ch] leading-relaxed text-ink-2">{scanned ? copy.scanned : copy.pending}</p>
              {!scanned && countdown && <p className="mt-4 text-sm text-muted">{copy.expires}: <strong className="text-ink">{countdown}</strong></p>}
              {!scanned && payment.qr_token_url && (
                <a href={payment.qr_token_url} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full border border-accent px-6 font-medium text-accent transition hover:bg-accent/10">
                  {copy.openKaspi}
                </a>
              )}
            </div>
          </div>
        )}

        {payment.status === "pending" && expiredLocally && (
          <div className="mt-5" role="status">
            <p className="max-w-[60ch] leading-relaxed text-ink-2">{copy.expired}</p>
            <button type="button" onClick={createQr} disabled={busy} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-accent px-6 font-medium text-on-accent disabled:opacity-50">
              {busy ? copy.loading : copy.retry}
            </button>
          </div>
        )}

        {payment.status === "paid" && (
          <div className="mt-5 rounded-2xl border border-accent/40 bg-bg/70 p-5" role="status">
            <p className="font-display text-lg font-bold text-ink">{copy.paidTitle}</p>
            <p className="mt-2 max-w-[62ch] leading-relaxed text-ink-2">{copy.paid}</p>
            <Button to="/application" className="mt-5">{copy.toApplication}</Button>
          </div>
        )}
      </article>
    </Reveal>
  );
}
