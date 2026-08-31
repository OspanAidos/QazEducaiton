import { Check } from "@phosphor-icons/react";
import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import Reveal from "../components/Reveal.jsx";
import {
  Notice,
  PageHead,
  RuleList,
  Section,
  SectionTitle,
} from "../components/page-blocks.jsx";


export default function Documents() {
  const lang = useLang();
  const p = pages[lang].documents;
  return (
    <>
      <PageHead label={p.label} title={p.title} lead={p.lead} />

      <Section>
        <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
          {p.groups.map((group, i) => (
            <Reveal key={group.name} delay={i * 0.06}>
              <article className="h-full rounded-block border border-line bg-bg-2 p-7 lg:p-9">
                <h2 className="font-display text-xl font-bold tracking-tight lg:text-2xl">
                  {group.name}
                </h2>
                <p className="mt-2 text-sm text-muted">{group.note}</p>

                <ul className="mt-7 grid gap-3.5">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-3 text-base leading-snug text-ink-2">
                      <Check
                        size={17}
                        weight="bold"
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-accent"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="border-t border-line">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <SectionTitle>{p.fileRulesTitle}</SectionTitle>
          </Reveal>
          <Reveal delay={0.06} className="lg:col-span-7">
            <RuleList items={p.fileRules} />
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
