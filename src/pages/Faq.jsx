import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import Accordion from "../components/Accordion.jsx";
import { PageHead, Section } from "../components/page-blocks.jsx";


export default function Faq() {
  const lang = useLang();
  const p = pages[lang].faq;
  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />
      <Section>
        <Accordion items={p.items} />
      </Section>
    </>
  );
}
