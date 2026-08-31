import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import Reveal from "../components/Reveal.jsx";
import { Notice, PageHead, Section } from "../components/page-blocks.jsx";


export default function BenefitsPage() {
  const lang = useLang();
  const p = pages[lang].benefits;
  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        <div className="border-t border-line">
          {p.items.map((item, i) => (
            <Reveal key={item.index} delay={i * 0.06}>
              <article className="grid gap-4 border-b border-line py-9 md:grid-cols-12 md:items-baseline md:gap-8 lg:py-12">
                <p className="font-display text-sm font-bold text-accent md:col-span-1">
                  {item.index}
                </p>
                <div className="md:col-span-5">
                  <h2 className="font-display text-2xl font-bold leading-tight tracking-tight lg:text-4xl">
                    {item.name}
                  </h2>
                  <p className="mt-2 text-sm uppercase tracking-[0.08em] text-muted">
                    {item.kicker}
                  </p>
                </div>
                <p className="max-w-[48ch] text-base leading-relaxed text-ink-2 md:col-span-6 lg:text-lg">
                  {item.text}
                </p>
              </article>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="mt-12 lg:max-w-[60%]">
            <Notice id="payment" {...p.notice} />
          </div>
        </Reveal>
      </Section>
    </>
  );
}
