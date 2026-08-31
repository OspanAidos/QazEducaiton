import { pages } from "../pages-content.js";
import { useLang } from "../lang-context.jsx";
import { media } from "../media.js";
import Reveal from "../components/Reveal.jsx";
import {
  Notice,
  NumberedGrid,
  PageHead,
  RuleList,
  Section,
  SectionTitle,
} from "../components/page-blocks.jsx";


export default function Eligibility() {
  const lang = useLang();
  const p = pages[lang].eligibility;
  return (
    <>
      <PageHead
        label={p.label}
        title={p.title}
        lead={p.lead}
        photo={media.eligibilityPhoto}
        photoWebp={media.eligibilityPhotoWebp}
        photoAlt={p.photoAlt}
        photoPosition="center 22%"
      />

      <Section>
        <Reveal>
          <SectionTitle>{p.categoriesTitle}</SectionTitle>
        </Reveal>
        <div className="mt-12">
          <NumberedGrid items={p.categories} columns={2} />
        </div>
      </Section>

      <Section className="border-t border-line">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <SectionTitle>{p.requirementsTitle}</SectionTitle>
          </Reveal>
          <Reveal delay={0.06} className="lg:col-span-7">
            <RuleList items={p.requirements} />
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
