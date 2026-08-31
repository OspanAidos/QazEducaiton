import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import { media } from "../media.js";
import Reveal from "../components/Reveal.jsx";
import { PageHead, Section, SectionTitle } from "../components/page-blocks.jsx";


export default function About() {
  const lang = useLang();
  const p = pages[lang].about;
  return (
    <>
      <PageHead
        label={p.label}
        title={p.title}
        lead={p.lead}
        photo={media.aboutPhoto}
        photoWebp={media.aboutPhotoWebp}
        photoAlt={p.photoAlt}
      >
        <ul className="mt-9 flex flex-wrap gap-2">
          {p.chips.map((chip) => (
            <li
              key={chip}
              className="rounded-full border border-line px-4 py-2 text-sm text-ink-2"
            >
              {chip}
            </li>
          ))}
        </ul>
      </PageHead>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {p.blocks.map((block, i) => (
            <Reveal key={block.title} delay={i * 0.06}>
              <SectionTitle>{block.title}</SectionTitle>
              <p className="mt-6 max-w-[54ch] text-base leading-relaxed text-ink-2 lg:text-lg">
                {block.text}
              </p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-t border-line">
        <Reveal>
          <SectionTitle>{p.principlesTitle}</SectionTitle>
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-block bg-line md:grid-cols-2">
          {p.principles.map((item, i) => (
            <Reveal key={item.name} delay={Math.min(i, 3) * 0.05}>
              <article className="h-full bg-bg-2 p-7 lg:p-9">
                <h3 className="font-display text-xl font-bold tracking-tight lg:text-2xl">
                  {item.name}
                </h3>
                <p className="mt-4 max-w-[44ch] text-base leading-relaxed text-ink-2">
                  {item.text}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>
    </>
  );
}
