import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import { NumberedGrid, PageHead, Section } from "../components/page-blocks.jsx";


export default function Stages() {
  const lang = useLang();
  const p = pages[lang].stages;
  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        {/* 8 этапов: сетка 2 колонки на планшете, 4 на десктопе, 1 на телефоне */}
        <NumberedGrid items={p.steps} columns={2} />
      </Section>
    </>
  );
}
