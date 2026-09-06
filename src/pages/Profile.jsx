import { useEffect, useState } from "react";
import { useAuth } from "../auth-context.jsx";
import { useLang } from "../lang-context.jsx";
import { dashboard, STATUS_ORDER } from "../dashboard-content.js";
import Reveal from "../components/Reveal.jsx";
import { Button } from "../components/ui.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";
import { Check } from "@phosphor-icons/react";
import { isSupabaseConfigured, supabase } from "../supabase.js";
import { applicationProgress, paymentLabel, isCompetitionPaid } from "../admin-domain.js";
import CertificatesPanel from "../components/CertificatesPanel.jsx";

function computeProgress(profile) {
  const fields = [profile?.first_name, profile?.last_name, profile?.phone];
  const filled = fields.filter((v) => v && String(v).trim()).length;

  return Math.round((filled / fields.length) * 20);
}

function formatDeadline(iso, lang) {
  if (!iso) return null;

  try {
    return new Date(iso).toLocaleDateString(
      lang === "kk" ? "kk-KZ" : "ru-RU",
      {
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    );
  } catch {
    return null;
  }
}

export default function Profile() {
  const lang = useLang();
  const t = dashboard[lang];

  const {
    user,
    profile,
    application,
    signOut,
  } = useAuth();
  const [payments, setPayments] = useState([]);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    if (!user?.id || !application?.id || !isSupabaseConfigured) return;
    let active = true;

    Promise.all([
      supabase
        .from("payments")
        .select("id,user_id,payment_type,status,amount_tenge,paid_at,provider,credit_payment_id,is_sandbox,refunded_tenge")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("application_documents")
        .select("id,kind")
        .eq("application_id", application.id),
    ]).then(([paymentResult, documentsResult]) => {
      if (!active) return;
      setPayments(paymentResult.error ? [] : paymentResult.data || []);
      setDocuments(documentsResult.error ? [] : documentsResult.data || []);
    });

    return () => {
      active = false;
    };
  }, [application?.id, application?.status, user?.id]);

  if (!user) return null;

  const firstName = profile?.first_name || "";
  const lastName = profile?.last_name || "";

  const displayName =
    firstName ||
    profile?.phone ||
    (profile?.telegram_username
      ? `@${profile.telegram_username}`
      : "") ||
    "Участник";

  /*
   * Данные заявки
   */
  const status = application?.status || "draft";

  const number = application?.number || "—";

  const progress = application?.data
    ? applicationProgress({ ...application, documents })
    : application?.progress ?? computeProgress(profile);
  const paid = isCompetitionPaid({ payments });

  const deadline = formatDeadline(
    application?.deadline,
    lang
  );
  const appealDeadline = formatDeadline(application?.appeal_deadline, lang);
  const decision = application?.decision || null;
  const canAppeal =
    ["result", "rejected"].includes(status) &&
    application?.appeal_deadline &&
    new Date(application.appeal_deadline).getTime() > Date.now();

  /*
   * Что показываем участнику следующим действием.
   * Если для конкретного статуса текста нет,
   * используем draft.
   */
  const next =
    t.nextByStatus?.[status] ||
    t.nextByStatus?.draft || {
      lead: "",
      text: "",
      actionLabel: null,
      actionTo: null,
    };

  /*
   * Комментарий администратора показываем
   * только при доработке или отклонении.
   */
  const showAdminReason =
    Boolean(application?.admin_status_comment) &&
    (status === "needs_fixes" ||
      status === "rejected");

  return (
    <>
      <PageHead
        label={t.label}
        title={t.greeting(displayName)}
        lead={`${t.signedInAs} ${
          profile?.phone ||
          (profile?.telegram_username
            ? `@${profile.telegram_username}`
            : "Telegram")
        }.`}
      >
        <div className="mt-9">
          <button
            type="button"
            onClick={signOut}
            className="px-2 text-sm text-ink-2 underline underline-offset-4 transition-colors duration-300 hover:text-ink"
          >
            {t.signOut}
          </button>
        </div>
      </PageHead>

      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label={t.appNumber}
            value={number}
            mono
          />

          <div className="rounded-block border border-line bg-bg-2 p-6">
            <p className="text-sm uppercase tracking-[0.08em] text-muted">
              {t.progressTitle}
            </p>

            <p className="mt-2 font-display text-3xl font-extrabold text-ink">
              {progress}%
            </p>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{
                  width: `${Math.min(
                    Math.max(progress, 0),
                    100
                  )}%`,
                }}
              />
            </div>
          </div>

          <SummaryCard
            label={t.deadlineTitle}
            value={deadline || t.noDeadline}
            muted={!deadline}
          />

          <SummaryCard
            label={lang === "kk" ? "Қатысу төлемі" : "Оплата участия"}
            value={paid
              ? (lang === "kk" ? "Расталды" : "Подтверждена")
              : paymentLabel({ payments })}
            muted={!paid}
          />
        </div>

        <Reveal>
          <div className="mt-6 rounded-block border border-accent/40 bg-accent/5 p-6 lg:p-8">
            <p className="text-sm uppercase tracking-[0.08em] text-accent">
              {t.nextTitle}
            </p>

            {next.lead && (
              <p className="mt-3 font-display text-xl font-bold tracking-tight text-ink lg:text-2xl">
                {next.lead}
              </p>
            )}

            {next.text && (
              <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-ink-2">
                {next.text}
              </p>
            )}

            {next.actionLabel &&
              next.actionTo && (
                <Button
                  to={next.actionTo}
                  className="mt-6"
                >
                  {next.actionLabel}
                </Button>
              )}
          </div>
        </Reveal>

        {showAdminReason && (
          <Reveal>
            <div
              className={`mt-6 rounded-block border p-6 lg:p-8 ${
                status === "rejected"
                  ? "border-red-400/40 bg-red-400/5"
                  : "border-accent/40 bg-bg-2"
              }`}
            >
              <p className="text-sm uppercase tracking-[0.08em] text-muted">
                {t.adminReasonTitle}
              </p>

              <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink">
                {application?.admin_status_comment}
              </p>
              {canAppeal && (
                <div className="mt-5 flex flex-wrap items-center gap-4">
                  <Button to="/appeal">{t.appealAction}</Button>
                  {appealDeadline && (
                    <p className="text-sm text-muted">
                      {t.appealUntil}: {appealDeadline}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Reveal>
        )}

        {decision && (
          <Reveal>
            <div className="mt-6 rounded-block border border-accent/50 bg-accent/5 p-6 lg:p-8">
              <p className="text-sm uppercase tracking-[0.08em] text-accent">
                {t.resultTitle}
              </p>
              <p className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
                {t.decisionLabels?.[decision] ?? decision}
              </p>
              <p className="mt-3 max-w-[66ch] text-base leading-relaxed text-ink-2">
                {t.decisionTexts?.[decision] ?? ""}
              </p>
              {canAppeal && (
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Button to="/appeal">{t.appealAction}</Button>
                  {appealDeadline && (
                    <p className="text-sm text-muted">
                      {t.appealUntil}: {appealDeadline}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Reveal>
        )}

        <div className="mt-10">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {t.statusTitle}
          </h2>

          <StatusTracker
            current={status}
            labels={t.statusLabels}
          />
        </div>

        <div className="mt-10">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {t.accountTitle}
          </h2>

          <dl className="mt-6 border-t border-line">
            {[
              [
                t.fields.firstName,
                firstName || t.empty,
              ],
              [
                t.fields.lastName,
                lastName || t.empty,
              ],
              [
                t.fields.phone,
                profile?.phone || t.empty,
              ],
              [
                "Telegram",
                profile?.telegram_username
                  ? `@${profile.telegram_username}`
                  : profile?.telegram_user_id
                    ? "Подключён"
                    : t.empty,
              ],
            ].map(([label, val]) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line py-4"
              >
                <dt className="text-sm uppercase tracking-[0.08em] text-muted">
                  {label}
                </dt>

                <dd className="font-display text-lg font-medium text-ink">
                  {val}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 text-sm text-muted">
            {t.editHint}
          </p>
        </div>

        <CertificatesPanel userId={user.id} />
      </Section>
    </>
  );
}

function SummaryCard({
  label,
  value,
  mono,
  muted,
}) {
  return (
    <div className="rounded-block border border-line bg-bg-2 p-6">
      <p className="text-sm uppercase tracking-[0.08em] text-muted">
        {label}
      </p>

      <p
        className={`mt-2 font-display text-xl font-bold ${
          muted ? "text-muted" : "text-ink"
        } ${
          mono
            ? "tabular-nums tracking-tight"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusTracker({
  current,
  labels,
}) {
  const safeLabels = labels || {};

  const currentIndex =
    STATUS_ORDER.indexOf(current);

  const branch =
    !STATUS_ORDER.includes(current);

  return (
    <div className="mt-6">
      {branch && (
        <div className="mb-5 inline-flex rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent">
          {safeLabels[current] ?? current}
        </div>
      )}

      <ol>
        {STATUS_ORDER.map((key, i) => {
          const done =
            !branch && i < currentIndex;

          const active =
            !branch && i === currentIndex;

          const isLast =
            i === STATUS_ORDER.length - 1;

          return (
            <li
              key={key}
              className="flex gap-4"
            >
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    done
                      ? "border-accent bg-accent text-on-accent"
                      : active
                        ? "border-accent text-accent"
                        : "border-line text-muted"
                  }`}
                >
                  {done ? (
                    <Check
                      size={14}
                      weight="bold"
                    />
                  ) : (
                    i + 1
                  )}
                </span>

                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={`w-px flex-1 ${
                      !branch &&
                      i < currentIndex
                        ? "bg-accent"
                        : "bg-line"
                    }`}
                    style={{
                      minHeight: "1.5rem",
                    }}
                  />
                )}
              </div>

              <div
                className={`pb-6 ${
                  active ? "" : "opacity-70"
                }`}
              >
                <p
                  className={`font-display text-base font-medium ${
                    active
                      ? "text-accent"
                      : done
                        ? "text-ink"
                        : "text-ink-2"
                  }`}
                >
                  {safeLabels[key] ?? key}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
