import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle, WarningCircle, XCircle } from "@phosphor-icons/react";
import { certificateDate, certificateType } from "../certificate-domain.js";
import { isSupabaseConfigured, supabase } from "../supabase.js";
import { Section } from "../components/page-blocks.jsx";
import { useLang } from "../lang-context.jsx";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CertificateVerify() {
  const lang = useLang();
  const kk = lang === "kk";
  const tr = (ru, kz) => (kk ? kz : ru);
  const { token = "" } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let active = true;

    if (!isSupabaseConfigured || !UUID_PATTERN.test(token)) {
      setState({ loading: false, data: null, error: tr("Сертификат не найден.", "Сертификат табылмады.") });
      return undefined;
    }

    supabase
      .rpc("verify_certificate", { p_token: token })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("verify certificate:", error);
          setState({
            loading: false,
            data: null,
            error: tr("Не удалось выполнить проверку. Попробуйте позже.", "Тексеру орындалмады. Кейінірек қайталап көріңіз."),
          });
          return;
        }
        setState({ loading: false, data: Array.isArray(data) ? data[0] : data, error: "" });
      });

    return () => {
      active = false;
    };
  }, [token, kk]);

  const certificate = state.data;
  const valid = certificate?.valid === true;
  const revoked = certificate?.certificate_status === "revoked";

  return (
    <Section className="min-h-[65vh] !pt-16 lg:!pt-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">
          {tr("Проверка сертификата QazEducation", "QazEducation сертификатын тексеру")}
        </h1>

        {state.loading && (
          <div className="mt-10 rounded-block border border-line bg-bg-2 p-7" role="status">
            <p className="text-ink-2">{tr("Проверяем подлинность документа…", "Құжаттың түпнұсқалығын тексеріп жатырмыз…")}</p>
          </div>
        )}

        {!state.loading && valid && (
          <div className="mt-10 rounded-block border border-emerald-400/50 bg-emerald-400/5 p-7 sm:p-9">
            <div className="flex items-start gap-4">
              <CheckCircle size={38} weight="fill" className="shrink-0 text-emerald-400" />
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">
                  {tr("Сертификат действителен", "Сертификат жарамды")}
                </h2>
                <p className="mt-2 text-ink-2">
                  {tr("Запись найдена в официальном реестре QazEducation.", "Жазба QazEducation ресми тізілімінен табылды.")}
                </p>
              </div>
            </div>

            <dl className="mt-8 divide-y divide-line border-y border-line">
              {[
                [tr("Статус", "Мәртебе"), tr("Действителен", "Жарамды")],
                [tr("Получатель", "Алушы"), `${certificate.recipient_first_name || ""} ${certificate.recipient_last_name || ""}`.trim()],
                [tr("Сертификат", "Сертификат"), certificateType(certificate.certificate_type).label],
                [tr("Номер", "Нөмірі"), certificate.certificate_number],
                [tr("Дата выдачи", "Берілген күні"), certificateDate(certificate.issued_at)],
                ...(certificate.basis_text ? [[tr("Основание", "Негіздеме"), certificate.basis_text]] : []),
              ].map(([label, value]) => (
                <div key={label} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr]">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-medium text-ink">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {!state.loading && revoked && (
          <div className="mt-10 rounded-block border border-amber-400/50 bg-amber-400/5 p-7 sm:p-9">
            <div className="flex items-start gap-4">
              <WarningCircle size={38} weight="fill" className="shrink-0 text-amber-400" />
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">
                  {tr("Сертификат отозван", "Сертификат кері қайтарылған")}
                </h2>
                <p className="mt-2 text-ink-2">
                  {tr("Этот номер существует в реестре, но документ больше не является действующим.", "Бұл нөмір тізілімде бар, бірақ құжат енді жарамсыз.")}
                </p>
              </div>
            </div>
          </div>
        )}

        {!state.loading && !valid && !revoked && (
          <div className="mt-10 rounded-block border border-red-400/50 bg-red-400/5 p-7 sm:p-9">
            <div className="flex items-start gap-4">
              <XCircle size={38} weight="fill" className="shrink-0 text-red-400" />
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">
                  {tr("Сертификат не подтверждён", "Сертификат расталмады")}
                </h2>
                <p className="mt-2 text-ink-2">
                  {state.error || tr("Запись с таким QR-кодом отсутствует в официальном реестре.", "Мұндай QR-коды бар жазба ресми тізілімде жоқ.")}
                </p>
              </div>
            </div>
          </div>
        )}

        <Link
          to="/"
          className="mt-8 inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
        >
          {tr("Вернуться на сайт", "Сайтқа оралу")}
        </Link>
      </div>
    </Section>
  );
}
