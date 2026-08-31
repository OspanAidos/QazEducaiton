import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import Reveal from "../components/Reveal.jsx";
import { Notice, PageHead, Section, SectionTitle } from "../components/page-blocks.jsx";


export default function Transparency() {
  const lang = useLang();
  const p = pages[lang].transparency;
  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        <div className="grid gap-px overflow-hidden rounded-block bg-line md:grid-cols-2">
          {p.blocks.map((block, i) => (
            <Reveal key={block.name} delay={Math.min(i, 3) * 0.05}>
              <article className="h-full bg-bg-2 p-7 lg:p-9">
                <h2 className="font-display text-xl font-bold tracking-tight lg:text-2xl">
                  {block.name}
                </h2>
                <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-ink-2">
                  {block.text}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-t border-line">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <SectionTitle>{p.publicationTitle}</SectionTitle>
          </Reveal>
          <Reveal delay={0.06} className="lg:col-span-7">
            <p className="max-w-[60ch] text-base leading-relaxed text-ink-2 lg:text-lg">
              {p.publicationText}
            </p>
          </Reveal>
        </div>

        <Reveal>
          <div className="mt-12 lg:max-w-[60%]">
            <Notice {...p.notice} />
          </div>
        </Reveal>
      </Section>
    </>
  );
}
