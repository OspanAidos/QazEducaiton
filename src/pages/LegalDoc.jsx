import { useParams } from "react-router-dom";
import { legalDocs } from "../legal-docs.js";
import NotFound from "./NotFound.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";

/**
 * Страница одного юридического документа. Ключ берётся из URL
 * (/docs/:slug). Текст — из legal-docs.js. Нумерованные пункты
 * («1. ОБЩИЕ ПОЛОЖЕНИЯ») отображаются как подзаголовки, остальное —
 * абзацами. Документы одинаковы на обоих языках (официальные тексты
 * пока только на русском), поэтому не зависят от переключателя.
 */
const isHeading = (t) => /^\d+(\.\d+)*\.?\s+[А-ЯA-Z]/.test(t) || /^[А-Я\s]{8,}$/.test(t);

export default function LegalDoc() {
  const { slug } = useParams();
  const doc = Object.values(legalDocs).find((d) => d.path === `/docs/${slug}`);
  if (!doc) return <NotFound />;

  // Первый абзац — это заголовок документа, выносим его в PageHead.
  const [heading, ...rest] = doc.body;

  return (
    <>
      <PageHead label="документ программы" title={doc.title} />
      <Section>
        <article className="mx-auto max-w-[70ch]">
          <p className="text-sm text-muted">{heading}</p>
          <div className="mt-8 grid gap-4">
            {rest.map((para, i) =>
              isHeading(para) ? (
                <h2
                  key={i}
                  className="mt-6 font-display text-lg font-bold tracking-tight text-ink first:mt-0"
                >
                  {para}
                </h2>
              ) : (
                <p key={i} className="text-[0.9375rem] leading-relaxed text-ink-2">
                  {para}
                </p>
              )
            )}
          </div>
        </article>
      </Section>
    </>
  );
}
