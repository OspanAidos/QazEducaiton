import { useEffect, useState } from "react";
import { ArrowSquareOut, DownloadSimple, SealCheck } from "@phosphor-icons/react";
import { useLang } from "../lang-context.jsx";
import { isSupabaseConfigured, supabase } from "../supabase.js";
import {
  certificateDate,
  certificateType,
  certificateVerifyUrl,
} from "../certificate-domain.js";
import {
  certificatePreviewUrl,
  downloadCertificate,
} from "../certificate-files.js";

const copy = {
  ru: {
    title: "Сертификаты",
    intro:
      "Официальные сертификаты QazEducation. Подлинность каждого документа подтверждается персональным QR-кодом.",
    loading: "Загружаем сертификаты…",
    empty:
      "Сертификат участника появится после подтверждённой оплаты пакета 10 000 ₸ и успешной подачи заявки. Итоговые сертификаты появятся после публикации решения комиссии.",
    issued: "Выдан",
    pdf: "Скачать PDF",
    png: "Скачать PNG",
    verify: "Проверить QR",
    downloadError: "Не удалось сформировать файл. Обновите страницу и попробуйте снова.",
    loadError: "Не удалось загрузить сертификаты. Попробуйте обновить страницу.",
  },
  kk: {
    title: "Сертификаттар",
    intro:
      "QazEducation ресми сертификаттары. Әр құжаттың түпнұсқалығы жеке QR-кодпен расталады.",
    loading: "Сертификаттарды жүктеп жатырмыз…",
    empty:
      "Қатысушы сертификаты 10 000 ₸ пакетінің төлемі расталып, өтінім сәтті жіберілгеннен кейін пайда болады. Қорытынды сертификаттар комиссия шешімі жарияланғаннан кейін қолжетімді болады.",
    issued: "Берілген күні",
    pdf: "PDF жүктеу",
    png: "PNG жүктеу",
    verify: "QR тексеру",
    downloadError: "Файлды дайындау мүмкін болмады. Бетті жаңартып, қайталап көріңіз.",
    loadError: "Сертификаттарды жүктеу мүмкін болмады. Бетті жаңартып көріңіз.",
  },
};

function CertificatePreview({ certificate }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSrc("");
    setFailed(false);

    certificatePreviewUrl(certificate)
      .then((url) => {
        objectUrl = url;
        if (active) setSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch((error) => {
        console.error("certificate preview:", error);
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [certificate]);

  if (failed) {
    return (
      <div className="flex aspect-[1.414/1] items-center justify-center bg-bg px-6 text-center text-sm text-muted">
        Предпросмотр временно недоступен
      </div>
    );
  }

  if (!src) {
    return <div className="aspect-[1.414/1] animate-pulse bg-line/40" />;
  }

  return (
    <img
      src={src}
      alt={`Предпросмотр: ${certificateType(certificate.certificate_type).label}`}
      className="aspect-[1.414/1] w-full object-cover"
    />
  );
}

function CertificateCard({ certificate, t }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const type = certificateType(certificate.certificate_type);

  const download = async (format) => {
    if (busy) return;
    setBusy(format);
    setError("");
    try {
      await downloadCertificate(certificate, format);
    } catch (downloadError) {
      console.error("certificate download:", downloadError);
      setError(t.downloadError);
    } finally {
      setBusy("");
    }
  };

  return (
    <article className="overflow-hidden rounded-block border border-line bg-bg-2">
      <CertificatePreview certificate={certificate} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <SealCheck size={26} weight="duotone" className="mt-0.5 shrink-0 text-accent" />
          <div>
            <h3 className="font-display text-base font-bold leading-snug text-ink">
              {type.label}
            </h3>
            <p className="mt-2 text-sm tabular-nums text-accent">
              {certificate.certificate_number}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t.issued}: {certificateDate(certificate.issued_at)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => download("pdf")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            <DownloadSimple size={17} />
            {busy === "pdf" ? "…" : t.pdf}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => download("png")}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <DownloadSimple size={17} />
            {busy === "png" ? "…" : t.png}
          </button>
          <a
            href={certificateVerifyUrl(certificate.verification_token)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
          >
            <ArrowSquareOut size={17} />
            {t.verify}
          </a>
        </div>

        {error && <p className="mt-4 text-sm text-red-300" role="alert">{error}</p>}
      </div>
    </article>
  );
}

export default function CertificatesPanel({ userId }) {
  const lang = useLang();
  const t = copy[lang] || copy.ru;
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    supabase
      .from("certificates")
      .select(
        "id,certificate_type,certificate_number,verification_token,recipient_first_name,recipient_last_name,basis_text,status,issued_at,metadata"
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .order("issued_at", { ascending: true })
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) {
          console.error("certificates:", loadError);
          setError(t.loadError);
          setCertificates([]);
        } else {
          setCertificates(data || []);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t.loadError, userId]);

  return (
    <section id="certificates" className="mt-12 scroll-mt-24">
      <h2 className="font-display text-xl font-bold tracking-tight text-ink">
        {t.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-2">
        {t.intro}
      </p>

      {loading && <p className="mt-6 text-sm text-muted" role="status">{t.loading}</p>}
      {!loading && error && <p className="mt-6 text-sm text-red-300" role="alert">{error}</p>}
      {!loading && !error && certificates.length === 0 && (
        <div className="mt-6 rounded-block border border-line bg-bg-2 p-6">
          <p className="max-w-3xl text-sm leading-relaxed text-ink-2">{t.empty}</p>
        </div>
      )}
      {!loading && certificates.length > 0 && (
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {certificates.map((certificate) => (
            <CertificateCard key={certificate.id} certificate={certificate} t={t} />
          ))}
        </div>
      )}
    </section>
  );
}
